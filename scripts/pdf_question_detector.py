#!/usr/bin/env python3
"""
CFO CBMERJ - Deterministic PDF Question Detector & High-Fidelity Cropper
Engine: PyMuPDF (fitz) + Pillow
"""

import sys
import os
import re
import json
import argparse
import math
from typing import List, Dict, Any, Optional, Tuple

try:
    import fitz  # PyMuPDF
    from PIL import Image
except ImportError as e:
    sys.stderr.write(f"MISSING_DEPENDENCY: {e}\n")
    sys.exit(2)

# Blindagem de codificação UTF-8 para stdout e stderr no Windows
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass


# ==============================================================================
# CONFIGURAÇÃO E CONSTANTES
# ==============================================================================

DEFAULT_DPI = 180
SCALE_FACTOR = DEFAULT_DPI / 72.0  # 180 / 72 = 2.5x

TOP_PADDING = 8.0
BOTTOM_PADDING = 10.0
LEFT_PADDING = 8.0
RIGHT_PADDING = 8.0

# Expressões regulares rigorosas para âncoras de questões
QUESTION_PATTERNS = [
    # 1. Padrão explícito: "QUESTÃO 01", "Questão 1", "QUESTAO 14"
    re.compile(r"^(?:QUEST[ÃA]O|Quest[ãa]o|Q\.)\s*0*(\d{1,3})(?:[\.\-\)\s:]|$)", re.IGNORECASE),
    # 2. Padrão numérico no início com separador: "01.", "01 -", "01)", "1."
    re.compile(r"^0*([1-9]\d{0,2})[\.\-\)]\s+"),
    # 3. Padrão Q1, Q01:
    re.compile(r"^Q\s*0*([1-9]\d{0,2})[\.\-\)\s:]", re.IGNORECASE),
    # 4. Padrão número isolado na linha/bloco (VUNESP, FGV, PMESP, CBMERJ): "01", "06", "62", "80"
    re.compile(r"^0*([1-9]\d{0,2})$"),
    # 5. Padrão número seguido de espaço e início de texto: "62 Quando a lâmpada..."
    re.compile(r"^0*([1-9]\d{0,2})\s+([A-ZÁ-Ú\"'].*)"),
]

# Padrões para descartar falsos positivos
FALSE_POSITIVE_PATTERNS = [
    re.compile(r"^(?:19|20)\d{2}\b"),                # Anos como 1994, 2024, 2025
    re.compile(r"^\d+(?:[.,]\d+)?\s*%", re.IGNORECASE), # Percentuais como 10%, 1,5%
    re.compile(r"^(?:artigo|art\.)\s*\d+", re.IGNORECASE), # Artigos de lei
    re.compile(r"^(?:lei|decreto)\s*(?:n[º°.]|número)?\s*\d+", re.IGNORECASE), # Leis
    re.compile(r"^\d+(?:[.,]\d+)\b"),                # Decimais isolados como 1,5 ou 3.14
    re.compile(r"^(?:página|pag\.)\s*\d+", re.IGNORECASE), # Numeração de página
]

# Padrão estrito para alternativas: exige delimitador claro como A), (A), A., A -
OPTION_PATTERN = re.compile(r"^\s*(?:\(([A-Ea-e])\)|([A-Ea-e])[\.\-\)])(?:\t|\s+)(.*)$")

# Padrões de cabeçalho e rodapé que devem ser ignorados no fluxo da questão
HEADER_FOOTER_PATTERNS = [
    re.compile(r"^CADERNO\s+DE\s+QUEST[ÕO]ES", re.IGNORECASE),
    re.compile(r"^PROVA\s+(?:OBJETIVA|OFICIAL)", re.IGNORECASE),
    re.compile(r"^FOLHA\s+DE\s+RESPOSTAS?", re.IGNORECASE),
    re.compile(r"^CBMERJ\s*[-–]\s*CFO", re.IGNORECASE),
    re.compile(r"^CADETE\s+PM", re.IGNORECASE),
    re.compile(r"^PMES\d+", re.IGNORECASE),
    re.compile(r"Confidencial\s+at[ée]\s+o\s+momento", re.IGNORECASE),
    re.compile(r"^(?:P[áa]gina|P[áa]g\.)\s*\d+(?:\s*(?:de|/)\s*\d+)?$", re.IGNORECASE),
]

# Mapeamento de cabeçalhos de disciplina presentes nas páginas
DISCIPLINE_HEADER_PATTERNS = [
    (re.compile(r"^Hist[oó]ria$", re.IGNORECASE), "História"),
    (re.compile(r"^Geografia$", re.IGNORECASE), "Geografia"),
    (re.compile(r"^Filosofia$", re.IGNORECASE), "Filosofia"),
    (re.compile(r"^Sociologia$", re.IGNORECASE), "Sociologia"),
    (re.compile(r"^(?:L[íi]ngua\s+Portuguesa|Portugu[êe]s)$", re.IGNORECASE), "Língua Portuguesa"),
    (re.compile(r"^Literatura$", re.IGNORECASE), "Língua Portuguesa"),
    (re.compile(r"^(?:L[íi]ngua\s+Inglesa|Ingl[êe]s)$", re.IGNORECASE), "Língua Inglesa"),
    (re.compile(r"^(?:L[íi]ngua\s+Espanhola|Espanhol)$", re.IGNORECASE), "Língua Espanhola"),
    (re.compile(r"^Matem[áa]tica$", re.IGNORECASE), "Matemática"),
    (re.compile(r"^F[íi]sica$", re.IGNORECASE), "Física"),
    (re.compile(r"^Qu[íi]mica$", re.IGNORECASE), "Química"),
    (re.compile(r"^Biologia$", re.IGNORECASE), "Biologia"),
    (re.compile(r"^(?:Direito|Legisla[çc][ãa]o.*)$", re.IGNORECASE), "Legislação"),
    (re.compile(r"^Inform[áa]tica$", re.IGNORECASE), "Informática"),
]


# Padrão para texto de apoio compartilhado
SUPPORT_TEXT_PATTERNS = [
    re.compile(r"^(?:TEXTO|Texto)\s+(?:[IVXLCDM]+|\d+)", re.IGNORECASE),
    re.compile(r"^Leia\s+o\s+texto\s+(?:a\s+seguir|abaixo)", re.IGNORECASE),
    re.compile(r"^Considere\s+(?:o\s+texto|a\s+figura|o\s+gr[áa]fico|a\s+tabela)", re.IGNORECASE),
]


# ==============================================================================
# ANÁLISE DE TIPO E LAYOUT DE PÁGINA
# ==============================================================================

def detect_page_text_density(page: fitz.Page) -> Tuple[bool, int]:
    """
    Verifica se a página possui texto nativo suficiente ou se é escaneada/imagem.
    Retorna: (is_native, char_count)
    """
    text = page.get_text("text") or ""
    char_count = len(text.strip())
    # Páginas com menos de 50 caracteres normalmente são capas gráficas ou escaneadas
    is_native = char_count >= 50
    return is_native, char_count


def detect_page_columns(page: fitz.Page) -> Tuple[int, Optional[float]]:
    """
    Detecta se a página utiliza layout de 1 coluna ou 2 colunas.
    Retorna: (num_columns, divider_x)
    """
    page_rect = page.rect
    width = page_rect.width
    mid_x = width / 2.0

    blocks = page.get_text("blocks")
    if not blocks:
        return 1, None

    # Filtra blocos significativos (descarta rodapés ou cabeçalhos muito pequenos)
    content_blocks = []
    for b in blocks:
        # b = (x0, y0, x1, y1, text, block_no, block_type)
        if b[6] == 0:  # Bloco de texto
            b_w = b[2] - b[0]
            b_h = b[3] - b[1]
            # Se for texto com conteúdo visível
            if len(b[4].strip()) > 5:
                content_blocks.append(b)

    if not content_blocks:
        return 1, None

    # Verifica se há blocos largos que atravessam mais de 75% da página
    wide_blocks = sum(1 for b in content_blocks if (b[2] - b[0]) > (width * 0.70))
    if wide_blocks > len(content_blocks) * 0.6:
        # Predominantemente coluna única
        return 1, None

    # Analisa distribuição em torno do centro (mid_x)
    left_column_blocks = 0
    right_column_blocks = 0
    center_crossing_blocks = 0

    gap_margin = width * 0.04  # ~4% de tolerância no centro

    for b in content_blocks:
        x0, _, x1, _, _, _, _ = b
        if x1 < mid_x + gap_margin and x0 < mid_x - gap_margin:
            left_column_blocks += 1
        elif x0 > mid_x - gap_margin and x1 > mid_x + gap_margin:
            right_column_blocks += 1
        elif x0 < mid_x - gap_margin and x1 > mid_x + gap_margin:
            center_crossing_blocks += 1

    total_columnar = left_column_blocks + right_column_blocks
    if total_columnar >= 4 and total_columnar > center_crossing_blocks * 1.5:
        # Layout claro em duas colunas com divisor próximo a mid_x
        return 2, mid_x

    return 1, None


def extract_ordered_blocks(page: fitz.Page, num_columns: int, divider_x: Optional[float]) -> List[Dict[str, Any]]:
    """
    Extrai blocos de texto respeitando a ordem de leitura humana:
    - Se 2 colunas: processa coluna esquerda de cima para baixo, depois coluna direita de cima para baixo.
    - Se 1 coluna: processa de cima para baixo.
    """
    raw_blocks = page.get_text("blocks")
    structured = []

    for b in raw_blocks:
        if b[6] != 0:  # Ignora blocos que não sejam texto direto nesta etapa
            continue
        text = b[4].strip()
        if not text:
            continue

        x0, y0, x1, y1 = b[0], b[1], b[2], b[3]
        col_idx = 0
        if num_columns == 2 and divider_x is not None:
            # Se a média do bloco está à direita do divisor
            block_center_x = (x0 + x1) / 2.0
            if block_center_x >= divider_x:
                col_idx = 1

        structured.append({
            "x0": x0,
            "y0": y0,
            "x1": x1,
            "y1": y1,
            "text": text,
            "column": col_idx,
            "page": page.number + 1,
            "lines": [line.strip() for line in text.splitlines() if line.strip()]
        })

    if num_columns == 2:
        # Ordena: primeiro por coluna (0 antes de 1), depois por coordenada y0
        structured.sort(key=lambda item: (item["column"], item["y0"]))
    else:
        # Ordena simplesmente por y0
        structured.sort(key=lambda item: item["y0"])

    return structured


# ==============================================================================
# DETECÇÃO DETERMINÍSTICA DE QUESTÕES E COORDENADAS
# ==============================================================================

def check_question_anchor(first_line: str) -> Optional[Tuple[int, float]]:
    """
    Verifica se a linha inicia uma questão e retorna (question_number, confidence).
    """
    clean = first_line.strip()

    # Verifica falsos positivos comuns
    for fp in FALSE_POSITIVE_PATTERNS:
        if fp.search(clean):
            return None

    # Tenta padrões de questão por prioridade
    for idx, pattern in enumerate(QUESTION_PATTERNS):
        m = pattern.search(clean)
        if m:
            num = int(m.group(1))
            # Questões de prova tipicamente vão de 1 a 180
            if 1 <= num <= 180:
                confidence = 0.98 if idx == 0 else (0.92 if idx == 1 else 0.88)
                return num, confidence

    return None


def get_visual_elements_in_range(page: fitz.Page, y_start: float, y_end: float, x_min: float, x_max: float) -> List[fitz.Rect]:
    """
    Detecta imagens e desenhos vetoriais (gráficos, esquemas, fórmulas) dentro da área da questão.
    """
    elements = []
    # 1. Desenhos vetoriais (retângulos, curvas, tabelas feitas com paths)
    try:
        drawings = page.get_drawings()
        for d in drawings:
            rect = d.get("rect")
            if rect:
                # Se o desenho intersecta verticalmente a faixa da questão
                if not (rect.y1 < y_start or rect.y0 > y_end):
                    # Se o desenho está dentro da coluna
                    if not (rect.x1 < x_min or rect.x0 > x_max):
                        elements.append(rect)
    except Exception:
        pass

    # 2. Imagens embutidas
    try:
        image_list = page.get_images()
        for img in image_list:
            xref = img[0]
            for img_rect in page.get_image_rects(xref):
                if not (img_rect.y1 < y_start or img_rect.y0 > y_end):
                    if not (img_rect.x1 < x_min or img_rect.x0 > x_max):
                        elements.append(img_rect)
    except Exception:
        pass

    return elements


def apply_safe_bounds(
    page_rect: fitz.Rect,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    col_x_min: float,
    col_x_max: float
) -> Dict[str, float]:
    """
    Aplica padding de segurança e garante que o bounding box permaneça estritamente
    dentro dos limites válidos da página e da coluna.
    """
    safe_x0 = max(col_x_min, x0 - LEFT_PADDING)
    safe_y0 = max(0.0, y0 - TOP_PADDING)
    safe_x1 = min(col_x_max, x1 + RIGHT_PADDING)
    safe_y1 = min(page_rect.height, y1 + BOTTOM_PADDING)

    # Invariantes geométricas
    width = max(10.0, safe_x1 - safe_x0)
    height = max(10.0, safe_y1 - safe_y0)

    return {
        "x": round(safe_x0, 2),
        "y": round(safe_y0, 2),
        "width": round(width, 2),
        "height": round(height, 2)
    }


def parse_question_content(text_blocks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Separa o texto do enunciado e extrai alternativas A-E encontradas no corpo.
    """
    statement_lines = []
    options = []
    all_lines = []

    for b in text_blocks:
        all_lines.extend(b["lines"])

    current_opt_letter = None
    current_opt_text = []

    for raw_line in all_lines:
        line = raw_line.replace("\t", " ").strip()
        if not line:
            continue

        # Descarta cabeçalhos/rodapés que possam ter sido capturados
        is_hf = any(hf.search(line) for hf in HEADER_FOOTER_PATTERNS)
        if is_hf:
            continue

        opt_match = OPTION_PATTERN.match(line)
        if opt_match:
            if current_opt_letter:
                options.append({
                    "letter": current_opt_letter.upper(),
                    "text": " ".join(current_opt_text).strip()
                })
            letter = opt_match.group(1) or opt_match.group(2)
            current_opt_letter = letter.upper()
            initial_text = opt_match.group(3).strip()
            current_opt_text = [initial_text] if initial_text else []
        elif current_opt_letter:
            current_opt_text.append(line)
        else:
            statement_lines.append(line)

    if current_opt_letter:
        options.append({
            "letter": current_opt_letter.upper(),
            "text": " ".join(current_opt_text).strip()
        })

    statement = "\n".join(statement_lines).strip()
    return {
        "statement": statement,
        "options": options
    }


# ==============================================================================
# PIPELINE PRINCIPAL DE DETECÇÃO EM DOCUMENTO
# ==============================================================================

def analyze_pdf(pdf_path: str, output_dir: str, dpi: int = DEFAULT_DPI) -> Dict[str, Any]:
    """
    Executa a análise determinística completa do PDF, detecção de questões,
    cálculo de bounding boxes, suporte a 2 colunas e recorte de imagens WebP.
    """
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    os.makedirs(output_dir, exist_ok=True)

    detected_questions: List[Dict[str, Any]] = []
    support_materials: List[Dict[str, Any]] = []

    # Estado de extração progressiva
    current_question: Optional[Dict[str, Any]] = None
    last_detected_num = 0
    current_discipline = "Conhecimentos Gerais"

    for page_idx in range(total_pages):
        page = doc[page_idx]
        page_num = page_idx + 1
        page_rect = page.rect

        is_native, char_count = detect_page_text_density(page)
        num_cols, divider_x = detect_page_columns(page)

        ordered_blocks = extract_ordered_blocks(page, num_cols, divider_x)

        # Se for capa ou folha de instruções inicial, não inicia questões
        page_raw_text = page.get_text("text") or ""
        is_cover_page = page_num <= 2 and (
            "CONCURSO PÚBLICO" in page_raw_text or
            "CADERNO DE QUESTÕES" in page_raw_text or
            "FOLHA DE RESPOSTAS" in page_raw_text
        )

        # Determina os limites x das colunas
        col_bounds = {}
        if num_cols == 2 and divider_x is not None:
            col_bounds[0] = (0.0, divider_x)
            col_bounds[1] = (divider_x, page_rect.width)
        else:
            col_bounds[0] = (0.0, page_rect.width)

        for block in ordered_blocks:
            lines = block["lines"]
            if not lines:
                continue

            # Atualiza a disciplina corrente se o bloco for um cabeçalho de disciplina
            clean_block_text = " ".join(lines).strip()
            for disc_regex, disc_name in DISCIPLINE_HEADER_PATTERNS:
                if disc_regex.search(clean_block_text):
                    current_discipline = disc_name
                    break

            # Se for página de capa/instruções, pula detecção de âncoras de questão
            if is_cover_page:
                continue

            # Ignora blocos muito colados no topo ou no rodapé extremo
            if block["y0"] < 20.0 or block["y1"] > (page_rect.height - 35.0):
                if any(hf.search(clean_block_text) for hf in HEADER_FOOTER_PATTERNS):
                    continue

            first_line = lines[0].replace("\t", " ").strip()
            anchor = check_question_anchor(first_line)

            if anchor:
                q_num, base_confidence = anchor

                # Validação de sequência rigorosa para evitar falsos positivos
                is_valid_sequence = False
                if last_detected_num == 0:
                    if q_num == 1:
                        is_valid_sequence = True
                elif q_num == last_detected_num + 1:
                    is_valid_sequence = True
                    base_confidence = min(1.0, base_confidence + 0.08)
                elif q_num > last_detected_num and q_num <= last_detected_num + 3:
                    is_valid_sequence = True  # Pulo pequeno tolerado
                # Se q_num <= last_detected_num, descarta (número menor em fração/equação)

                if is_valid_sequence:
                    # Finaliza a questão anterior se houver
                    if current_question is not None:
                        finalize_question(doc, current_question, output_dir, dpi)
                        detected_questions.append(current_question)

                    # Inicia nova questão
                    last_detected_num = q_num
                    col_idx = block["column"]
                    col_min, col_max = col_bounds.get(col_idx, (0.0, page_rect.width))

                    current_question = {
                        "questionNumber": q_num,
                        "confidence": base_confidence,
                        "status": "READY" if base_confidence >= 0.88 else "NEEDS_REVIEW",
                        "discipline": current_discipline,
                        "blocks": [block],
                        "segments": [],
                        "current_page": page_num,
                        "current_col": col_idx,
                        "col_min": col_min,
                        "col_max": col_max,
                        "x0": block["x0"],
                        "y0": block["y0"],
                        "x1": block["x1"],
                        "y1": block["y1"],
                    }
                    continue

            # Se estamos dentro de uma questão, acumula blocos
            if current_question is not None:
                q_page = current_question["current_page"]
                q_col = current_question["current_col"]

                # Verifica se houve mudança de coluna ou de página (continuidade multi-segmento)
                if page_num != q_page or block["column"] != q_col:
                    # Fecha o segmento atual
                    segment_bounds = apply_safe_bounds(
                        doc[q_page - 1].rect,
                        current_question["x0"],
                        current_question["y0"],
                        current_question["x1"],
                        current_question["y1"],
                        current_question["col_min"],
                        current_question["col_max"]
                    )
                    current_question["segments"].append({
                        "page": q_page,
                        "orderNum": len(current_question["segments"]) + 1,
                        "bounds": segment_bounds,
                        "source": "pdf_text"
                    })

                    # Inicia novo segmento na nova coluna/página
                    col_idx = block["column"]
                    col_min, col_max = col_bounds.get(col_idx, (0.0, page_rect.width))
                    current_question["current_page"] = page_num
                    current_question["current_col"] = col_idx
                    current_question["col_min"] = col_min
                    current_question["col_max"] = col_max
                    current_question["x0"] = float(block["x0"])
                    current_question["y0"] = float(block["y0"])
                    current_question["x1"] = float(block["x1"])
                    current_question["y1"] = float(block["y1"])
                else:
                    # Atualiza os limites do segmento atual na mesma coluna
                    current_question["x0"] = min(float(current_question["x0"]), float(block["x0"]))
                    current_question["y0"] = min(float(current_question["y0"]), float(block["y0"]))
                    current_question["x1"] = max(float(current_question["x1"]), float(block["x1"]))
                    current_question["y1"] = max(float(current_question["y1"]), float(block["y1"]))

                current_question["blocks"].append(block)

    # Finaliza a última questão processada
    if current_question is not None:
        finalize_question(doc, current_question, output_dir, dpi)
        detected_questions.append(current_question)

    doc.close()

    # Prepara o payload final para retorno
    results = []
    for q in detected_questions:
        results.append({
            "questionNumber": q["questionNumber"],
            "discipline": q.get("discipline", "Conhecimentos Gerais"),
            "confidence": round(q["confidence"], 2),
            "status": q["status"],
            "statement": q["content"]["statement"],
            "options": q["content"]["options"],
            "segments": q["final_segments"],
            "assets": q["assets"]
        })

    return {
        "success": True,
        "totalPages": total_pages,
        "totalQuestionsDetected": len(results),
        "questions": results,
        "supportMaterials": support_materials
    }


def finalize_question(doc: fitz.Document, question: Dict[str, Any], output_dir: str, dpi: int) -> None:
    """
    Fecha a questão, vincula elementos gráficos no bounding box, calcula o parsing
    do enunciado/alternativas e executa a renderização em alta fidelidade WebP.
    """
    q_page = question["current_page"]
    page = doc[q_page - 1]
    page_rect = page.rect

    # Fecha o último segmento aberto
    final_bounds = apply_safe_bounds(
        page_rect,
        question["x0"],
        question["y0"],
        question["x1"],
        question["y1"],
        question["col_min"],
        question["col_max"]
    )

    # Verifica se há elementos gráficos (imagens/vetores) no intervalo deste segmento
    visuals = get_visual_elements_in_range(
        page,
        final_bounds["y"],
        final_bounds["y"] + final_bounds["height"],
        final_bounds["x"],
        final_bounds["x"] + final_bounds["width"]
    )
    for v in visuals:
        # Expande o bounding box para abranger elementos visuais
        new_x0 = min(final_bounds["x"], v.x0)
        new_y0 = min(final_bounds["y"], v.y0)
        new_x1 = max(final_bounds["x"] + final_bounds["width"], v.x1)
        new_y1 = max(final_bounds["y"] + final_bounds["height"], v.y1)
        final_bounds = apply_safe_bounds(page_rect, new_x0, new_y0, new_x1, new_y1, question["col_min"], question["col_max"])

    question["segments"].append({
        "page": q_page,
        "orderNum": len(question["segments"]) + 1,
        "bounds": final_bounds,
        "source": "pdf_text"
    })

    # Extrai enunciado e opções
    content = parse_question_content(question["blocks"])
    if len(content["options"]) >= 2:
        question["confidence"] = min(1.0, question["confidence"] + 0.05)
    question["content"] = content

    # Renderiza e recorta cada segmento em WebP
    assets = []
    final_segments = []

    for seg_idx, seg in enumerate(question["segments"]):
        seg_page = seg["page"]
        b = seg["bounds"]
        q_num = question["questionNumber"]

        filename_orig = f"q{q_num:03d}_part{seg_idx + 1}_original.webp"
        filename_thumb = f"q{q_num:03d}_part{seg_idx + 1}_thumb.webp"

        path_orig = os.path.join(output_dir, filename_orig)
        path_thumb = os.path.join(output_dir, filename_thumb)

        crop_res = render_and_crop(
            doc,
            page_num=seg_page,
            bounds=b,
            output_orig_path=path_orig,
            output_thumb_path=path_thumb,
            dpi=dpi
        )

        final_segments.append({
            "orderNum": seg["orderNum"],
            "page": seg["page"],
            "bounds": b,
            "source": seg["source"]
        })

        if crop_res:
            assets.append({
                "segmentOrder": seg["orderNum"],
                "assetType": "original_crop",
                "filePath": path_orig,
                "width": crop_res["width"],
                "height": crop_res["height"],
                "format": "webp",
                "dpi": dpi
            })
            assets.append({
                "segmentOrder": seg["orderNum"],
                "assetType": "thumbnail",
                "filePath": path_thumb,
                "width": crop_res["thumb_width"],
                "height": crop_res["thumb_height"],
                "format": "webp",
                "dpi": 72
            })

    question["final_segments"] = final_segments
    question["assets"] = assets


def render_and_crop(
    doc: fitz.Document,
    page_num: int,
    bounds: Dict[str, float],
    output_orig_path: str,
    output_thumb_path: str,
    dpi: int = DEFAULT_DPI
) -> Optional[Dict[str, int]]:
    """
    Renderiza a área do bounding box em resolução de 180 DPI e salva em WebP.
    """
    try:
        page = doc[page_num - 1]
        scale = dpi / 72.0
        matrix = fitz.Matrix(scale, scale)

        clip_rect = fitz.Rect(
            bounds["x"],
            bounds["y"],
            bounds["x"] + bounds["width"],
            bounds["y"] + bounds["height"]
        )

        pix = page.get_pixmap(matrix=matrix, clip=clip_rect, alpha=False)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

        # Salva original em WebP com alta qualidade (q=92)
        img.save(output_orig_path, "WEBP", quality=92, method=6)

        # Gera thumbnail proporcional
        thumb = img.copy()
        thumb.thumbnail((400, 400), Image.Resampling.LANCZOS)
        thumb.save(output_thumb_path, "WEBP", quality=75, method=4)

        return {
            "width": pix.width,
            "height": pix.height,
            "thumb_width": thumb.width,
            "thumb_height": thumb.height
        }
    except Exception as e:
        sys.stderr.write(f"CROP_ERROR [page {page_num}]: {e}\n")
        return None


# ==============================================================================
# RECORTE MANUAL INDIVIDUAL (CHAMADO PELO EDITOR DO ADMIN)
# ==============================================================================

def crop_single_segment(
    pdf_path: str,
    page_num: int,
    x: float,
    y: float,
    width: float,
    height: float,
    output_file: str,
    dpi: int = DEFAULT_DPI
) -> Dict[str, Any]:
    """
    Executa o recorte pontual solicitado pela revisão manual do admin.
    """
    doc = fitz.open(pdf_path)
    if page_num < 1 or page_num > len(doc):
        doc.close()
        return {"success": False, "error": "INVALID_PAGE_NUMBER"}

    page = doc[page_num - 1]
    page_rect = page.rect

    # Validação geométrica estrita
    if x < 0 or y < 0 or width <= 0 or height <= 0:
        doc.close()
        return {"success": False, "error": "INVALID_COORDINATES"}

    if (x + width) > (page_rect.width + 5.0) or (y + height) > (page_rect.height + 5.0):
        doc.close()
        return {"success": False, "error": "COORDINATES_EXCEED_PAGE_BOUNDS"}

    scale = dpi / 72.0
    matrix = fitz.Matrix(scale, scale)
    clip_rect = fitz.Rect(x, y, x + width, y + height)

    pix = page.get_pixmap(matrix=matrix, clip=clip_rect, alpha=False)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    img.save(output_file, "WEBP", quality=92, method=6)

    doc.close()
    return {
        "success": True,
        "filePath": output_file,
        "width": pix.width,
        "height": pix.height,
        "dpi": dpi
    }


# ==============================================================================
# RENDERIZADOR DE PÁGINA INTEIRA PARA O EDITOR VISUAL
# ==============================================================================

def render_full_page(pdf_path: str, page_num: int, output_file: str, dpi: int = 120) -> Dict[str, Any]:
    """
    Renderiza uma página completa em resolução adequada para servir de base ao Editor Visual.
    """
    doc = fitz.open(pdf_path)
    if page_num < 1 or page_num > len(doc):
        doc.close()
        return {"success": False, "error": "INVALID_PAGE_NUMBER"}

    page = doc[page_num - 1]
    scale = dpi / 72.0
    matrix = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    img.save(output_file, "WEBP", quality=85)

    doc.close()
    return {
        "success": True,
        "page": page_num,
        "filePath": output_file,
        "width": pix.width,
        "height": pix.height,
        "pageWidthPt": page.rect.width,
        "pageHeightPt": page.rect.height,
        "dpi": dpi
    }


# ==============================================================================
# ENTRYPOINT CLI
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(description="Deterministic PDF Question Detector & Cropper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcomando: detect-and-crop
    detect_parser = subparsers.add_parser("detect-and-crop")
    detect_parser.add_argument("--pdf", required=True, help="Caminho do arquivo PDF")
    detect_parser.add_argument("--output-dir", required=True, help="Diretório de saída para os WebPs")
    detect_parser.add_argument("--dpi", type=int, default=DEFAULT_DPI, help="Resolução DPI de renderização")

    # Subcomando: crop-single
    crop_parser = subparsers.add_parser("crop-single")
    crop_parser.add_argument("--pdf", required=True, help="Caminho do arquivo PDF")
    crop_parser.add_argument("--page", type=int, required=True, help="Número da página (1-based)")
    crop_parser.add_argument("--x", type=float, required=True, help="Coordenada X inicial (pt)")
    crop_parser.add_argument("--y", type=float, required=True, help="Coordenada Y inicial (pt)")
    crop_parser.add_argument("--width", type=float, required=True, help="Largura (pt)")
    crop_parser.add_argument("--height", type=float, required=True, help="Altura (pt)")
    crop_parser.add_argument("--output-file", required=True, help="Caminho do arquivo WebP de saída")
    crop_parser.add_argument("--dpi", type=int, default=DEFAULT_DPI, help="DPI de renderização")

    # Subcomando: render-page
    page_parser = subparsers.add_parser("render-page")
    page_parser.add_argument("--pdf", required=True, help="Caminho do arquivo PDF")
    page_parser.add_argument("--page", type=int, required=True, help="Número da página (1-based)")
    page_parser.add_argument("--output-file", required=True, help="Caminho de saída para a imagem da página")
    page_parser.add_argument("--dpi", type=int, default=120, help="DPI da página")

    args = parser.parse_args()

    if args.command == "detect-and-crop":
        if not os.path.exists(args.pdf):
            print(json.dumps({"success": False, "error": "FILE_NOT_FOUND"}))
            sys.exit(1)
        res = analyze_pdf(args.pdf, args.output_dir, args.dpi)
        print(json.dumps(res, indent=2, ensure_ascii=False))

    elif args.command == "crop-single":
        if not os.path.exists(args.pdf):
            print(json.dumps({"success": False, "error": "FILE_NOT_FOUND"}))
            sys.exit(1)
        res = crop_single_segment(
            args.pdf,
            args.page,
            args.x,
            args.y,
            args.width,
            args.height,
            args.output_file,
            args.dpi
        )
        print(json.dumps(res, indent=2, ensure_ascii=False))

    elif args.command == "render-page":
        if not os.path.exists(args.pdf):
            print(json.dumps({"success": False, "error": "FILE_NOT_FOUND"}))
            sys.exit(1)
        res = render_full_page(args.pdf, args.page, args.output_file, args.dpi)
        print(json.dumps(res, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
