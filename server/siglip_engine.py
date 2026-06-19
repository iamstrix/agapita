"""
SigLIP2 Zero-Shot Sketch Classification Engine
===============================================

Uses Google's SigLIP2 (siglip2-so400m-patch14-384) contrastive vision-language
model for zero-shot classification of patient-drawn sketches against a
pre-computed AAC vocabulary embedding cache.

Optimized for Apple Silicon (MacBook Air M5) with:
- MPS GPU acceleration via PyTorch Metal backend
- float16 half-precision for minimal memory footprint (~1.5GB)
- Batched text embedding pre-computation
- torch.mps.empty_cache() for transient memory reclamation
"""

import io
import time
import logging
from typing import List, Tuple

import torch
import torch.nn.functional as F
from PIL import Image
from transformers import AutoModel, AutoProcessor

logger = logging.getLogger("AgapitaServer")

# ---------------------------------------------------------------------------
# Prompt template — biases SigLIP2 toward sketch/drawing domain
# ---------------------------------------------------------------------------
PROMPT_TEMPLATE = "a drawing of a {label}"


class SigLIPEngine:
    """
    Zero-shot image classifier backed by SigLIP2.

    Lifecycle:
        1. __init__()  → loads model + processor, detects device
        2. precompute_text_embeddings(labels)  → one-time at server startup
        3. classify(image_bytes, top_k)  → per-sketch inference
    """

    MODEL_ID = "google/siglip2-so400m-patch14-384"

    def __init__(self):
        start = time.perf_counter()

        # Robust device selection with automatic fallback
        success = False
        self.processor = AutoProcessor.from_pretrained(self.MODEL_ID)

        for device_name in ["mps", "cuda", "cpu"]:
            if device_name == "mps" and not torch.backends.mps.is_available():
                continue
            if device_name == "cuda" and not torch.cuda.is_available():
                continue

            try:
                self.device = torch.device(device_name)
                logger.info(f"[SigLIP2] Attempting to load model '{self.MODEL_ID}' onto {self.device}...")

                self.model = AutoModel.from_pretrained(
                    self.MODEL_ID,
                    dtype=torch.float16 if self.device.type != "cpu" else torch.float32,
                ).to(self.device).eval()

                # Test with a dummy input to verify kernel execution is working (e.g. catch Blackwell compatibility issues)
                if self.device.type == "cuda":
                    dummy = torch.randn(1, 3, 384, 384, device=self.device, dtype=torch.float16)
                    with torch.no_grad():
                        _ = self.model.get_image_features(pixel_values=dummy)

                success = True
                break
            except Exception as e:
                logger.warning(f"[SigLIP2] Failed to initialize model on {device_name}: {e}. Retrying with next device...")
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

        if not success:
            raise RuntimeError("Could not load SigLIP2 model on any device.")

        self.text_embeddings: torch.Tensor | None = None
        self.labels: List[str] = []
        
        self.scanner_embeddings: torch.Tensor | None = None
        self.scanner_labels: List[str] = []

        load_time = time.perf_counter() - start
        logger.info(
            f"[SigLIP2] Model loaded successfully in {load_time:.2f}s "
            f"(device={self.device}, dtype={self.model.dtype})"
        )

    # ── Pre-computation (called once at server startup) ─────────────────

    def precompute_text_embeddings(self, labels: List[str]) -> None:
        """
        Encode all AAC labels into L2-normalized text embeddings and cache
        them as a (N, D) tensor for fast cosine similarity at inference time.

        Labels are wrapped in PROMPT_TEMPLATE to bias toward sketch domain.
        Processed in batches of 128 to control peak memory.
        """
        import os
        start = time.perf_counter()

        # Check local cache first to bypass computation entirely
        cache_path = os.path.join(os.path.dirname(__file__), "siglip2_embeddings_cache.pt")
        if os.path.exists(cache_path):
            try:
                cache = torch.load(cache_path, map_location="cpu")
                # Ensure the cache labels list matches the requested labels list exactly
                if cache.get("labels") == labels:
                    self.text_embeddings = cache["embeddings"].to(self.device)
                    self.labels = list(labels)
                    elapsed = time.perf_counter() - start
                    logger.info(
                        f"[SigLIP2] Loaded {len(self.labels)} pre-computed text embeddings "
                        f"from cache in {elapsed:.4f}s (shape={tuple(self.text_embeddings.shape)})"
                    )
                    return
            except Exception as cache_err:
                logger.warning(f"[SigLIP2] Failed to load cached embeddings: {cache_err}. Recalculating...")

        logger.info(f"[SigLIP2] Pre-computing embeddings for {len(labels)} labels (missed/stale cache)...")
        prompts = [PROMPT_TEMPLATE.format(label=label) for label in labels]

        batch_size = 128
        all_features = []

        for i in range(0, len(prompts), batch_size):
            batch = prompts[i : i + batch_size]
            inputs = self.processor(
                text=batch, padding="max_length", return_tensors="pt"
            )
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self.model.get_text_features(**inputs)
                # Handle transformers 5.x returning BaseModelOutputWithPooling
                if hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
                    features = outputs.pooler_output
                else:
                    features = outputs if isinstance(outputs, torch.Tensor) else outputs[0]
                features = F.normalize(features, p=2, dim=-1)
                all_features.append(features)

        self.text_embeddings = torch.cat(all_features, dim=0)
        self.labels = list(labels)

        # Reclaim transient GPU memory used during batch processing
        if self.device.type == "mps":
            torch.mps.empty_cache()

        elapsed = time.perf_counter() - start
        logger.info(
            f"[SigLIP2] Pre-computed {len(self.labels)} text embeddings "
            f"in {elapsed:.2f}s (shape={tuple(self.text_embeddings.shape)})"
        )

        # Save to cache after a miss so future startups can skip recomputation.
        try:
            torch.save(
                {"labels": self.labels, "embeddings": self.text_embeddings.cpu()},
                cache_path,
            )
            logger.info(
                f"[SigLIP2] Saved pre-computed text embeddings to cache at {cache_path}"
            )
        except Exception as save_err:
            logger.warning(f"[SigLIP2] Failed to save embeddings cache: {save_err}")

    def precompute_scanner_embeddings(self, labels: List[str]) -> None:
        start = time.perf_counter()
        # For scanner, we might just use "a photo of a {label}" or just "{label}"
        prompts = [f"a photo of a {label}" for label in labels]
        
        batch_size = 128
        all_features = []

        for i in range(0, len(prompts), batch_size):
            batch = prompts[i : i + batch_size]
            inputs = self.processor(
                text=batch, padding="max_length", return_tensors="pt"
            )
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self.model.get_text_features(**inputs)
                if hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
                    features = outputs.pooler_output
                else:
                    features = outputs if isinstance(outputs, torch.Tensor) else outputs[0]
                features = F.normalize(features, p=2, dim=-1)
                all_features.append(features)

        self.scanner_embeddings = torch.cat(all_features, dim=0)
        self.scanner_labels = list(labels)

        if self.device.type == "mps":
            torch.mps.empty_cache()

        elapsed = time.perf_counter() - start
        logger.info(
            f"[SigLIP2] Pre-computed {len(self.scanner_labels)} scanner embeddings "
            f"in {elapsed:.2f}s (shape={tuple(self.scanner_embeddings.shape)})"
        )

    # ── Per-sketch classification ───────────────────────────────────────

    def classify(
        self, image_bytes: bytes, top_k: int = 5
    ) -> List[Tuple[str, float]]:
        """
        Classify a sketch image against the cached AAC label embeddings.

        Args:
            image_bytes: Raw image bytes (PNG/JPEG from the canvas).
            top_k: Number of top matches to return.

        Returns:
            List of (label, score) tuples sorted by descending similarity.
        """
        if self.text_embeddings is None:
            raise RuntimeError(
                "Text embeddings not pre-computed. Call precompute_text_embeddings() first."
            )

        start = time.perf_counter()

        # Decode and preprocess image
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        inputs = self.processor(images=image, return_tensors="pt")

        # Move to device with appropriate dtype
        if self.device.type != "cpu":
            inputs = {k: v.to(self.device).half() for k, v in inputs.items()}
        else:
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model.get_image_features(**inputs)
            # Handle transformers 5.x returning BaseModelOutputWithPooling
            if hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
                image_features = outputs.pooler_output
            else:
                image_features = outputs if isinstance(outputs, torch.Tensor) else outputs[0]
            image_features = F.normalize(image_features, p=2, dim=-1)

        # Cosine similarity via dot product (both vectors are L2-normalized)
        similarities = torch.matmul(
            image_features, self.text_embeddings.T
        ).squeeze(0)

        # Top-K selection
        top_scores, top_indices = similarities.topk(min(top_k, len(self.labels)))

        results = [
            (self.labels[idx.item()], score.item())
            for score, idx in zip(top_scores, top_indices)
        ]

        elapsed = time.perf_counter() - start
        logger.info(
            f"[SigLIP2] Classification completed in {elapsed:.4f}s → "
            f"top={results[0][0]} ({results[0][1]:.4f})"
        )

        return results

    def classify_and_locate(self, image_bytes: bytes, top_k: int = 3) -> List[dict]:
        """
        Classifies an image using scanner embeddings and estimates bounding boxes
        using patch-level similarities.
        """
        if self.scanner_embeddings is None:
            raise RuntimeError("Scanner embeddings not pre-computed.")

        start = time.perf_counter()

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        inputs = self.processor(images=image, return_tensors="pt")

        if self.device.type != "cpu":
            inputs = {k: v.to(self.device).half() for k, v in inputs.items()}
        else:
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            # Get patch embeddings (last_hidden_state)
            outputs = self.model.vision_model(**inputs)
            # outputs.last_hidden_state shape: (1, seq_len, hidden_size)
            # seq_len = patch_grid * patch_grid
            patch_embeds = outputs.last_hidden_state[0] # (seq_len, hidden_size)
            
            # Project patches to joint multimodal space
            patch_embeds = self.model.vision_model.head(patch_embeds) # (seq_len, hidden_size)
            patch_embeds = F.normalize(patch_embeds, p=2, dim=-1)

            # Global image feature
            if hasattr(self.model, "get_image_features"):
                global_outputs = self.model.get_image_features(**inputs)
                if hasattr(global_outputs, "pooler_output") and global_outputs.pooler_output is not None:
                    image_features = global_outputs.pooler_output
                else:
                    image_features = global_outputs if isinstance(global_outputs, torch.Tensor) else global_outputs[0]
            else:
                image_features = patch_embeds.mean(dim=0, keepdim=True)
            
            image_features = F.normalize(image_features, p=2, dim=-1)

        # Global classification
        similarities = torch.matmul(image_features, self.scanner_embeddings.T).squeeze(0)
        top_scores, top_indices = similarities.topk(min(top_k, len(self.scanner_labels)))

        # Patch similarity for bounding box
        patch_sims = torch.matmul(patch_embeds, self.scanner_embeddings[top_indices].T) # (seq_len, top_k)
        
        # Grid size assumes patch14-384 -> 384/14 = 27 (actually 27x27 = 729)
        # Let's dynamically calculate grid size
        seq_len = patch_embeds.shape[0]
        grid_size = int(seq_len ** 0.5)

        results = []
        for i, idx in enumerate(top_indices):
            label = self.scanner_labels[idx.item()]
            score = top_scores[i].item()
            
            # Get similarities for this specific label across all patches
            sim_map = patch_sims[:, i] # (seq_len,)
            
            # Threshold to find bounding box (e.g., top 15% of patches)
            threshold = torch.quantile(sim_map, 0.85)
            active_patches = (sim_map >= threshold).nonzero(as_tuple=True)[0]
            
            if len(active_patches) > 0:
                y_coords = active_patches // grid_size
                x_coords = active_patches % grid_size
                
                ymin = (y_coords.min().item() / grid_size) * 100
                ymax = ((y_coords.max().item() + 1) / grid_size) * 100
                xmin = (x_coords.min().item() / grid_size) * 100
                xmax = ((x_coords.max().item() + 1) / grid_size) * 100
                
                # Expand slightly for aesthetics
                padding = 5
                ymin = max(0, ymin - padding)
                ymax = min(100, ymax + padding)
                xmin = max(0, xmin - padding)
                xmax = min(100, xmax + padding)
            else:
                ymin, xmin, ymax, xmax = 25, 25, 75, 75 # Fallback
                
            results.append({
                "name": label,
                "score": score,
                "box_2d": [ymin, xmin, ymax, xmax]
            })

        elapsed = time.perf_counter() - start
        logger.info(f"[SigLIP2] Scan grounding completed in {elapsed:.4f}s")
        return results
