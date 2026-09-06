#!/usr/bin/env python3
"""
Gera os ícones do QICONEXÃO para o celular.

Por que um script e não arquivos soltos: ícone é imagem binária, e imagem
binária no repositório é uma decisão que ninguém consegue revisar depois. Aqui
a forma e as cores estão escritas, então mudar a identidade é mudar duas linhas
e rodar de novo — e o diff mostra o que mudou de verdade.

    python3 scripts/gerar-icones.py

O desenho da marca vive em scripts/marca.py, compartilhado com a imagem de
compartilhamento. Ela precisa ser legível a 48 pixels, que é o tamanho real na
gaveta de aplicativos — por isso duas formas grandes e nenhum detalhe.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from marca import AMEIXA, RAIO, marca  # noqa: E402

SAIDA = Path(__file__).resolve().parent.parent / 'public' / 'icones'


def gerar(lado, escala_da_marca, cantos):
    """cantos: 'redondos' recorta o quadrado, 'inteiros' sangra até a borda."""
    s = lado * RAIO
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if cantos == 'redondos':
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=AMEIXA)
    else:
        d.rectangle([0, 0, s, s], fill=AMEIXA)

    m = s * escala_da_marca
    marca(d, (s - m) / 2, (s - m) / 2, m)
    return img.resize((lado, lado), Image.LANCZOS)


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)

    # purpose "any": o sistema mostra como está, então os cantos vêm prontos.
    for lado in (192, 512):
        gerar(lado, 0.62, 'redondos').save(SAIDA / f'icone-{lado}.png')

    # purpose "maskable": o Android recorta na forma dele (círculo, gota,
    # quadrado). Só os 80% centrais são garantidos, então a marca encolhe e o
    # fundo sangra até a borda. Sem esta versão o ícone aparece cortado.
    gerar(512, 0.50, 'inteiros').save(SAIDA / 'icone-maskable-512.png')

    # O iOS ignora o manifest e lê apple-touch-icon. Ele mesmo arredonda, e
    # não aceita transparência — daí o quadrado inteiro.
    gerar(180, 0.62, 'inteiros').save(SAIDA / 'icone-apple-180.png')

    # Aba do navegador. Um .ico com três tamanhos cobre do Windows ao Chrome.
    base = gerar(64, 0.72, 'redondos')
    base.save(SAIDA / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])

    for f in sorted(SAIDA.iterdir()):
        print(f'  {f.name}  {f.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
