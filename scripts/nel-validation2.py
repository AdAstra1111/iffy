#!/usr/bin/env python3
"""Validate NEL certification — test corpus-resolver with correct project IDs."""
import json, subprocess, sys

SRK = "529e1dc059164c32fb05896b65e3c96d39e9c99fe93fd8c82961f8ff0b94428a"
URL = "https://hdfderbphdobomkdjypc.supabase.co"
FUNC = f"{URL}/functions/v1/corpus-resolver"

PROJECTS = {
    "Concrete Angels": "b6ae36fb-805b-4ff5-84ba-91fbccd46334",
    "YETI": "9404a383-5cdc-4f06-92aa-2ca70973c556",
}

for name, pid in PROJECTS.items():
    print(f"\n{'='*70}")
    print(f"  {name} ({pid})")
    print(f"{'='*70}")
    
    result = subprocess.run(
        ["curl", "-s", "-X", "POST", FUNC,
         "-H", f"Authorization: Bearer ***         "-H", "Content-Type", "application/json",
         "-d", json.dumps({"projectId": pid, "includePlaintext": False})],
        capture_output=True, text=True, timeout=30
    )
    
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"  FAIL: Could not parse response: {result.stdout[:200]}")
        continue
    
    if "error" in data:
        print(f"  FAIL: {data['error']}")
        continue
    
    corpus = data.get("corpus", {})
    summary = corpus.get("summary", {})
    
    total_docs = summary.get("totalDocs", 0)
    scene_count = summary.get("sceneCount", 0)
    scene_source = summary.get("sceneIndexSource", "?")
    entity_count = summary.get("entityCount", 0)
    entity_source = summary.get("entitySource", "?")
    has_screenplay = summary.get("hasScreenplay", False)
    doc_types = summary.get("documentTypes", [])
    has_charbible = summary.get("hasCharacterBible", False)
    corpus_size = summary.get("corpusSize", 0)
    
    print(f"  Documents: {total_docs}")
    print(f"  Doc types: {doc_types}")
    print(f"  Has screenplay: {has_screenplay}")
    print(f"  Has character bible: {has_charbible}")
    print(f"  Corpus size: {corpus_size} chars")
    print(f"  Scene count: {scene_count}  (source: {scene_source})")
    print(f"  Entity count: {entity_count}  (source: {entity_source})")
    
    # Test with plaintext to check fallback
    if scene_source == "unavailable" and total_docs > 0:
        print(f"\n  --- Testing fallback with plaintext ---")
        result2 = subprocess.run(
            ["curl", "-s", "-X", "POST", FUNC,
             "-H", f"Authorization: Bearer ***             "-H", "Content-Type", "application/json",
             "-d", json.dumps({"projectId": pid, "includePlaintext": True})],
            capture_output=True, text=True, timeout=30
        )
        try:
            data2 = json.loads(result2.stdout)
            summary2 = data2.get("corpus", {}).get("summary", {})
            print(f"  Scene source: {summary2.get('sceneIndexSource')}")
            print(f"  Scenes: {summary2.get('sceneCount')}")
            print(f"  Entity source: {summary2.get('entitySource')}")
            print(f"  Entities: {summary2.get('entityCount')}")
            if summary2.get("sceneCount", 0) > 0:
                print(f"  ✅ Fallback scene parsing works")
            else:
                print(f"  ⚠️  No fallback scenes — screenplay may be truncated or absent")
        except Exception as e:
            print(f"  Fallback test error: {e}")
    
    print(f"  ✅ Corpus resolves successfully")

print(f"\n{'='*70}")
print(f"  Phase 1 validation complete")
print(f"{'='*70}")
