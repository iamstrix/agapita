# Error Log

## [2026-04-26] ModuleNotFoundError: No module named 'ollama'

### Error Trace
```
Jose@LAPTOP-A1NGRMG0 MINGW64 /c/dev/antigravity/agapita/server
$ python main.py
Traceback (most recent call last):
  File "C:\dev\antigravity\agapita\server\main.py", line 10, in <module>
    import ollama
ModuleNotFoundError: No module named 'ollama'
```

### Audit & Analysis
- **Problem:** `server/main.py` requires `ollama` library, but it is not installed in the current environment.
- **Root Cause:** Missing dependency in `server/requirements.txt` or failure to install requirements in the active virtual environment.
- **Potential Fixes:**
  1. Add `ollama` to `server/requirements.txt`.
  2. Run `pip install ollama` within the `server/venv` environment.
  3. Verify if `ollama` server is intended to be used via library or API calls.

### Resolution [2026-04-26]
- Added `ollama` to `server/requirements.txt`.
- Verified `ollama` installation in `server/venv`.
- **Note:** Ensure to run the server using the virtual environment's python: `.\venv\Scripts\python.exe main.py` or activate the venv first.

## [2026-04-26] RuntimeError: no running event loop

### Error Trace
```
Traceback (most recent call last):
  File "C:\dev\antigravity\agapita\server\main.py", line 125, in <module>
    ai_engine = AIEngine()
                ^^^^^^^^^^
  File "C:\dev\antigravity\agapita\server\main.py", line 73, in __init__
    asyncio.create_task(self.seed_data())
  File "C:\Users\Jose\AppData\Local\Python\pythoncore-3.11-64\Lib\asyncio\tasks.py", line 381, in create_task
    loop = events.get_running_loop()
           ^^^^^^^^^^^^^^^^^^^^^^^^^
RuntimeError: no running event loop
sys:1: RuntimeWarning: coroutine 'AIEngine.seed_data' was never awaited
```

### Audit & Analysis
- **Problem:** `asyncio.create_task()` was called in the `AIEngine` constructor during module initialization, before the `asyncio` event loop was running.
- **Root Cause:** Module-level instantiation of classes that trigger async background tasks requires an active event loop, which isn't present until the ASGI server (Uvicorn) starts.
- **Resolution:** 
  1. Removed `asyncio.create_task()` from `AIEngine.__init__`.
  2. Implemented a FastAPI `lifespan` event handler to trigger `seed_data()` after the server starts and the loop is active.
  3. Modernized the code by replacing the deprecated `@app.on_event("startup")` with the `lifespan` context manager.

## [2026-04-26] Gradle Build Failed: Unsupported class file major version 69

### Error Trace
```
* What went wrong:
Could not open settings generic class cache for settings file 'C:\dev\Antigravity\agapita\client\android\settings.gradle' (C:\Users\Jose\.gradle\caches\8.6\scripts\75qmsrt4b7auiwyomf5m2ipdm).
> BUG! exception in phase 'semantic analysis' in source unit '_BuildScript_' Unsupported class file major version 69
```

### Audit & Analysis
- **Problem:** Gradle 8.6 is incompatible with the installed Java version (Java 25, which corresponds to major version 69).
- **Root Cause:** The system is using Java 25 (LTS), but Gradle 8.6 only supports up to Java 21. React Native and Gradle generally require a more stable/supported JDK like 17 or 21.
- **Potential Fixes:**
  1. **Downgrade JDK:** Install and use JDK 17 or JDK 21.
  2. **Set JAVA_HOME:** If multiple JDKs are installed, point `JAVA_HOME` to a compatible version (e.g., JDK 17).
  3. **Gradle Update:** While not recommended for existing React Native projects without careful testing, upgrading Gradle to a version that supports Java 25 (if available) would also work.

### Resolution [2026-04-26]
- **Installed Local JDK 17**: Downloaded and extracted a portable JDK 17 into `client/android/jdk17`.
- **Configured `gradlew.bat`**: Modified the Gradle wrapper to prioritize the local `jdk17` folder by setting `JAVA_HOME` within the script scope.
- **Result**: The project now builds using JDK 17 locally, even if Java 25 is installed system-wide.
- **Verification**: `gradlew -v` confirms use of JVM 17.0.x.
- **Cleanup**: Created and ran `setup_jdk.ps1` for automation (retained in project for future reference).
