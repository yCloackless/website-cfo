import fitz
import os
import sys

def create_synthetic_exam(output_path: str):
    doc = fitz.open()

    # Página 1: Layout de coluna única com Questão 01 e Questão 02 + gráfico
    page1 = doc.new_page(width=595.28, height=841.89) # A4
    page1.insert_text((50, 50), "PROVA OFICIAL CFO CBMERJ 2026 - CONHECIMENTOS GERAIS", fontsize=14)
    page1.insert_text((50, 70), "No ano de 2024, de acordo com o artigo 5º da legislação, 15% dos recursos foram destinados à corporação.", fontsize=9)

    # Questão 01
    page1.insert_text((50, 110), "QUESTÃO 01", fontsize=12)
    page1.insert_text((50, 130), "Um oficial bombeiro necessita calcular a pressão hidrostática exercida em uma coluna de água de 10 metros.", fontsize=10)
    page1.insert_text((50, 145), "Considerando g = 10 m/s² e densidade da água = 1000 kg/m³, a pressão no fundo vale:", fontsize=10)
    page1.insert_text((60, 170), "A) 100.000 Pa", fontsize=10)
    page1.insert_text((60, 190), "B) 50.000 Pa", fontsize=10)
    page1.insert_text((60, 210), "C) 10.000 Pa", fontsize=10)
    page1.insert_text((60, 230), "D) 1.000 Pa", fontsize=10)

    # Questão 02 com desenho vetorial (diagrama)
    page1.insert_text((50, 280), "QUESTÃO 02", fontsize=12)
    page1.insert_text((50, 300), "Analise o circuito esquemático de combate a incêndio apresentado na figura a seguir:", fontsize=10)
    # Desenho vetorial simulando diagrama
    rect_diagram = fitz.Rect(100, 320, 400, 400)
    page1.draw_rect(rect_diagram, color=(0, 0, 1), fill=(0.9, 0.9, 1))
    page1.insert_text((120, 360), "[Diagrama Operacional de Pressão e Válvulas]", fontsize=11)
    page1.insert_text((50, 430), "A vazão máxima que o circuito pode suportar sem cavitação é:", fontsize=10)
    page1.insert_text((60, 455), "A) 250 L/min", fontsize=10)
    page1.insert_text((60, 475), "B) 500 L/min", fontsize=10)
    page1.insert_text((60, 495), "C) 750 L/min", fontsize=10)
    page1.insert_text((60, 515), "D) 1000 L/min", fontsize=10)

    # Página 2: Layout de 2 colunas com Questão 03 (coluna 1) e Questão 04 (coluna 2)
    page2 = doc.new_page(width=595.28, height=841.89)
    page2.insert_text((50, 50), "CADERNO DE QUESTÕES - FÍSICA E QUÍMICA", fontsize=12)
    # Linha divisória vertical
    page2.draw_line((297.64, 70), (297.64, 780), color=(0.7, 0.7, 0.7), width=0.5)

    # Coluna 1 (x: 40 a 280)
    page2.insert_text((50, 90), "QUESTÃO 03", fontsize=11)
    page2.insert_text((50, 110), "Em uma reação de combustão completa do propano (C3H8):", fontsize=9)
    page2.insert_text((50, 125), "C3H8 + 5 O2 -> 3 CO2 + 4 H2O", fontsize=9)
    page2.insert_text((50, 145), "A massa de CO2 produzida pela queima de 44g de propano é:", fontsize=9)
    page2.insert_text((55, 170), "A) 44 g", fontsize=9)
    page2.insert_text((55, 185), "B) 88 g", fontsize=9)
    page2.insert_text((55, 200), "C) 132 g", fontsize=9)
    page2.insert_text((55, 215), "D) 176 g", fontsize=9)

    # Coluna 2 (x: 315 a 555)
    page2.insert_text((320, 90), "QUESTÃO 04", fontsize=11)
    page2.insert_text((320, 110), "Um projétil é lançado obliquamente com velocidade v0 = 20 m/s", fontsize=9)
    page2.insert_text((320, 125), "fazendo ângulo de 30º com a horizontal (sen 30º = 0,5).", fontsize=9)
    page2.insert_text((320, 145), "O tempo total de permanência no ar é:", fontsize=9)
    page2.insert_text((325, 170), "A) 1,0 s", fontsize=9)
    page2.insert_text((325, 185), "B) 2,0 s", fontsize=9)
    page2.insert_text((325, 200), "C) 3,0 s", fontsize=9)
    page2.insert_text((325, 215), "D) 4,0 s", fontsize=9)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    doc.save(output_path)
    doc.close()
    print(f"Synthetic exam PDF created at {output_path}")

if __name__ == "__main__":
    out = os.path.join("data", "test_fixtures", "synthetic_exam.pdf")
    create_synthetic_exam(out)
