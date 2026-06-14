"""
Inference Backend Abstraction Layer for Agapita.

Provides a unified interface for VLM/LLM inference, allowing the server
to switch between Ollama (cross-platform, GPU-agnostic) and MLX-VLM
(Apple Silicon native, Metal-accelerated) at runtime.
"""

import asyncio
import base64
import io
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from PIL import Image

logger = logging.getLogger("AgapitaServer")


class InferenceBackend(ABC):
    """Abstract base class for inference backends."""

    @abstractmethod
    async def generate(
        self,
        model: str,
        prompt: str,
        images: Optional[List[bytes]] = None,
        format: Optional[str] = None,
        think: bool = False,
        keep_alive: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> dict:
        """
        Run a generation request and return a result dictionary.

        The returned dict MUST contain at least:
            - 'response': str  — the generated text

        It SHOULD also contain (for telemetry):
            - 'prompt_eval_duration': int  — nanoseconds for prompt processing
            - 'eval_duration': int  — nanoseconds for token generation
            - 'prompt_eval_count': int  — number of prompt tokens
            - 'eval_count': int  — number of generated tokens
        """
        ...

    @abstractmethod
    async def warmup(self, model: str, think: bool = False) -> None:
        """Pre-load and warm up a model for fast first inference."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable backend name for telemetry logs."""
        ...


class OllamaBackend(InferenceBackend):
    """
    Wraps the existing Ollama Python client.
    This is the original Agapita backend — zero behavior change.
    """

    @property
    def name(self) -> str:
        return "Ollama"

    async def generate(
        self,
        model: str,
        prompt: str,
        images: Optional[List[bytes]] = None,
        format: Optional[str] = None,
        think: bool = False,
        keep_alive: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> dict:
        import ollama

        kwargs: Dict[str, Any] = {
            "model": model,
            "prompt": prompt,
        }
        if images is not None:
            kwargs["images"] = images
        if format is not None:
            kwargs["format"] = format
        if think:
            kwargs["think"] = think
        if keep_alive is not None:
            kwargs["keep_alive"] = keep_alive
        if options is not None:
            kwargs["options"] = options

        response = await asyncio.to_thread(ollama.generate, **kwargs)
        return response

    async def warmup(self, model: str, think: bool = False) -> None:
        """Warm up using Ollama's AsyncClient with a dummy VLM request."""
        import ollama

        img = Image.new("RGB", (224, 224), color="white")
        from PIL import ImageDraw

        d = ImageDraw.Draw(img)
        d.text((10, 10), "Test Medication 10mg", fill=(0, 0, 0))

        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        dummy_image = buf.getvalue()

        prompt = """
        Analyze this image containing a prescription, medication label, or medical supply.
        Extract the structured information to be used as medical grounding.
        Return a JSON object with this exact structure:
        {
          "type": "medication",
          "name": "name of medication or supply",
          "details": "dosage, frequency, or relevant details"
        }
        """

        start = time.perf_counter()
        logger.info(
            f"[TELEMETRY] [{self.name}] Preloading and warming up model '{model}'..."
        )

        async_client = ollama.AsyncClient()
        response = await async_client.generate(
            model=model,
            prompt=prompt,
            images=[dummy_image],
            format="json",
            think=think,
            keep_alive="10m",
            options={"num_ctx": 1024},
        )

        warmup_time = time.perf_counter() - start
        prefill_s = response.get("prompt_eval_duration", 0) / 1e9
        decode_s = response.get("eval_duration", 0) / 1e9

        logger.info(
            f"[TELEMETRY] [{self.name}] Warmup completed in {warmup_time:.4f}s"
        )
        logger.info(
            f"[TELEMETRY] ├─ Prefill: {prefill_s:.4f}s ({response.get('prompt_eval_count', 0)} tokens)"
        )
        logger.info(
            f"[TELEMETRY] ├─ Decode: {decode_s:.4f}s ({response.get('eval_count', 0)} tokens)"
        )
        logger.info(f"[TELEMETRY] └─ Total: {prefill_s + decode_s:.4f}s")


class MLXBackend(InferenceBackend):
    """
    Direct in-process inference via mlx-vlm on Apple Silicon.
    Uses Metal GPU acceleration through Apple's MLX framework.
    The model is loaded once into unified memory and kept resident.
    """

    def __init__(self):
        self._model = None
        self._processor = None
        self._tokenizer = None
        self._model_path: Optional[str] = None
        self._loaded = False

    @property
    def name(self) -> str:
        return "MLX"

    async def load_model(self, model_path: str) -> None:
        """
        Load the model and processor into Apple Silicon unified memory.
        First run downloads from HuggingFace (~7GB for 12B QAT);
        subsequent runs load from ~/.cache/huggingface/.
        """
        if self._loaded and self._model_path == model_path:
            logger.info(
                f"[MLX] Model '{model_path}' already loaded — skipping."
            )
            return

        logger.info(f"[MLX] Loading model '{model_path}' into unified memory...")
        start = time.perf_counter()

        def _load():
            from mlx_vlm import load

            model, processor = load(model_path)
            return model, processor

        self._model, self._processor = await asyncio.to_thread(_load)
        self._model_path = model_path
        self._loaded = True

        load_time = time.perf_counter() - start
        logger.info(f"[MLX] Model loaded successfully in {load_time:.2f}s")

    def _images_to_pil(self, image_bytes_list: List[bytes]) -> List[str]:
        """
        Convert raw image bytes to temporary file paths that mlx-vlm can read.
        mlx-vlm's generate() accepts image paths or URLs, not raw bytes.
        We save to temp files and return the paths.
        """
        import tempfile
        import os

        paths = []
        for img_bytes in image_bytes_list:
            # Ensure it's a valid image and convert to a standard format
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            img.save(tmp, format="JPEG", quality=85)
            tmp.close()
            paths.append(tmp.name)
        return paths

    async def generate(
        self,
        model: str,
        prompt: str,
        images: Optional[List[bytes]] = None,
        format: Optional[str] = None,
        think: bool = False,
        keep_alive: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> dict:
        if not self._loaded:
            raise RuntimeError(
                "MLX model not loaded. Call load_model() first."
            )

        opts = options or {}
        max_tokens = opts.get("num_predict", 100)
        temperature = opts.get("temperature", 0.0)

        # Build the prompt with JSON instruction if format is requested
        final_prompt = prompt
        if format == "json" and "json" not in prompt.lower():
            final_prompt = prompt + "\nRespond with valid JSON only."

        # Prepare image paths for mlx-vlm
        image_paths = []
        if images:
            image_paths = self._images_to_pil(images)

        start_total = time.perf_counter()

        def _run_inference():
            from mlx_vlm import generate as mlx_generate
            from mlx_vlm.utils import load_image

            inference_start = time.perf_counter()

            if image_paths:
                # Vision + Language inference
                result = mlx_generate(
                    self._model,
                    self._processor,
                    final_prompt,
                    image=image_paths[0] if len(image_paths) == 1 else image_paths,
                    max_tokens=max_tokens,
                    temperature=temperature if temperature > 0 else 0.0,
                    verbose=False,
                )
            else:
                # Text-only inference (RAG)
                result = mlx_generate(
                    self._model,
                    self._processor,
                    final_prompt,
                    max_tokens=max_tokens,
                    temperature=temperature if temperature > 0 else 0.0,
                    verbose=False,
                )

            inference_time = time.perf_counter() - inference_start
            return result, inference_time

        result, inference_time = await asyncio.to_thread(_run_inference)

        total_time = time.perf_counter() - start_total

        # Clean up temp image files
        import os
        for path in image_paths:
            try:
                os.unlink(path)
            except OSError:
                pass

        # Normalize response to match Ollama's dict format for seamless
        # compatibility with AIEngine's existing telemetry and parsing code.
        response_text = result if isinstance(result, str) else str(result)

        return {
            "response": response_text,
            # Approximate telemetry in nanoseconds (MLX doesn't expose
            # the same granularity as Ollama, so we use wall-clock time)
            "prompt_eval_duration": int(inference_time * 0.3 * 1e9),  # ~30% prefill estimate
            "eval_duration": int(inference_time * 0.7 * 1e9),  # ~70% decode estimate
            "prompt_eval_count": 0,  # Not available from mlx-vlm
            "eval_count": max_tokens,  # Upper bound
        }

    async def warmup(self, model: str, think: bool = False) -> None:
        """
        Warm up the MLX model with a dummy inference pass.
        This compiles Metal shaders and populates caches.
        """
        if not self._loaded:
            logger.warning("[MLX] Cannot warmup — model not loaded yet.")
            return

        logger.info(f"[TELEMETRY] [MLX] Warming up model '{model}'...")
        start = time.perf_counter()

        # Create a small dummy image
        img = Image.new("RGB", (224, 224), color="white")
        from PIL import ImageDraw

        d = ImageDraw.Draw(img)
        d.text((10, 10), "Test", fill=(0, 0, 0))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        dummy_bytes = buf.getvalue()

        try:
            response = await self.generate(
                model=model,
                prompt="Describe this image in one word.",
                images=[dummy_bytes],
                options={"num_predict": 10, "temperature": 0.0},
            )
            warmup_time = time.perf_counter() - start
            logger.info(
                f"[TELEMETRY] [MLX] Warmup completed in {warmup_time:.4f}s — "
                f"response: '{response.get('response', '')[:50]}'"
            )
        except Exception as e:
            logger.warning(f"[MLX] Warmup failed: {e}")
