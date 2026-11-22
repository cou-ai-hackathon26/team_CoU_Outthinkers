"""Small, inspectable retrieval layer for clinician-reviewed guidance."""

import re
import json
from dataclasses import dataclass
from pathlib import Path

KNOWLEDGE_ROOT = Path(__file__).resolve().parents[2] / "knowledge"


@dataclass(frozen=True)
class KnowledgeChunk:
    title: str
    text: str
    source: str


def _load_chunks() -> list[KnowledgeChunk]:
    chunks: list[KnowledgeChunk] = []
    manifest_path = KNOWLEDGE_ROOT / "sources_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"documents": []}
    metadata = {item.get("text_file"): item for item in manifest["documents"] if item.get("text_file")}
    for path in sorted(KNOWLEDGE_ROOT.glob("*.md")):
        if path.name == "README.md":
            continue
        content = path.read_text(encoding="utf-8")
        title_match = re.search(r"^title:\s*(.+)$", content, re.MULTILINE)
        source_match = re.search(r"^source:\s*(.+)$", content, re.MULTILINE)
        sections = re.split(r"\n(?=## )", content.split("---", 2)[-1])
        for section in sections:
            text = section.strip()
            if text:
                chunks.append(KnowledgeChunk(title=title_match.group(1).strip() if title_match else path.stem, text=text, source=source_match.group(1).strip() if source_match else path.name))
    for path in sorted((KNOWLEDGE_ROOT / "sources").glob("*.txt")):
        item = metadata.get(f"sources/{path.name}", {})
        paragraphs = [part.strip() for part in re.split(r"\n\s*\n", path.read_text(encoding="utf-8", errors="ignore")) if part.strip()]
        current = ""
        for paragraph in paragraphs:
            if len(current) + len(paragraph) > 5000 and current:
                chunks.append(KnowledgeChunk(title=item.get("title", path.stem), text=current, source=item.get("url", path.name)))
                current = ""
            current += ("\n\n" if current else "") + paragraph
        if current:
            chunks.append(KnowledgeChunk(title=item.get("title", path.stem), text=current, source=item.get("url", path.name)))
    return chunks


def retrieve_guidance(query: str, limit: int = 3) -> list[KnowledgeChunk]:
    query_terms = {term for term in re.findall(r"[\w\u0980-\u09FF]+", query.lower()) if len(term) > 2}
    scored = []
    for chunk in _load_chunks():
        chunk_terms = set(re.findall(r"[\w\u0980-\u09FF]+", chunk.text.lower()))
        score = len(query_terms & chunk_terms)
        if score:
            scored.append((score, chunk))
    return [chunk for _, chunk in sorted(scored, key=lambda item: item[0], reverse=True)[:limit]]


def format_guidance(chunks: list[KnowledgeChunk]) -> str:
    if not chunks:
        return "কোনো clinician-reviewed guidance মেলেনি। সাধারণ চিকিৎসা তথ্য অনুমান করো না।"
    return "\n\n".join(f"[{chunk.title}]\n{chunk.text}\nSource: {chunk.source}" for chunk in chunks)
