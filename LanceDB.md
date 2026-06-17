# LanceDB Integration Plan

This document outlines the architecture and steps required to replace the in-memory PyTorch vector storage with LanceDB in the Agapita backend. 

## Goals
- Offload vector embeddings from active Python RAM to memory-mapped files on disk.
- Eliminate the need to re-compute embeddings (the "RAG pre-warming" phase) every time the server restarts.
- Keep the system purely local, fast, and dependency-light.

## Proposed Architecture

1. **Database Structure**: 
   - We will use `lancedb` to create an embedded database at `server/lancedb_data`.
   - A single table named `patient_records` will store the data.
   - Schema: `patient_id` (string), `text` (string), `vector` (array of 384 floats).

2. **Source of Truth Sync**:
   - `agapita.db` (SQLite) currently acts as the source of truth for `MedicalRecord`s. 
   - At startup, we will compare the records in SQLite with the records in LanceDB. 
   - Only new records will be embedded and inserted into LanceDB, reducing startup time to virtually zero on subsequent boots.

## Changes Required

### 1. Dependencies
#### [MODIFY] server/requirements.txt
Add `lancedb` and `pyarrow` to the project dependencies.

### 2. Vector Store Implementation
#### [MODIFY] server/vector_store.py
Rewrite `VectorRecordStore` to use LanceDB instead of Python dictionaries.
- **`__init__`**: Initialize `lancedb.connect("./lancedb_data")` and open or create the `patient_records` table.
- **`add_record`**: Embed the text and append it to the LanceDB table.
- **`search`**: Use `table.search(query_vec).where(f"patient_id='{patient_id}'").limit(top_k).to_list()` to find matches. We will also implement a manual score threshold equivalent to the existing `> 0.05` cosine similarity.
- **`clear`**: Drop the LanceDB table and recreate it.

### 3. Server Startup Logic
#### [MODIFY] server/main.py
Update `reload_record_store` to handle intelligent syncing:
- Currently, `main.py` clears the vector store and re-adds everything from SQLite on every boot. 
- We will update this so it intelligently checks what is already in LanceDB, avoiding expensive re-computation of embeddings.

## Open Questions

> [!WARNING]
> **Source of Truth**: Currently, SQLite (`agapita.db`) is the main database for records, and we generate vectors from it. Would you like to keep SQLite as the absolute source of truth and just use LanceDB as a "vector cache", or would you prefer to completely replace the SQLite `MedicalRecord` table with LanceDB so we only have one database managing records?

## Verification Plan

### Manual Verification
1. Restart the server and verify that `lancedb_data` is created.
2. Restart the server a second time and verify that `[VectorStore]` does not re-compute embeddings, significantly accelerating startup.
3. Draw a sketch on the patient dashboard and ensure RAG intent synthesis correctly fetches contextual records from LanceDB within milliseconds.
