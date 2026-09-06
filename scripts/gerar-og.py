#!/usr/bin/env python3
"""
Gera a imagem de compartilhamento (Open Graph) do QICONEXÃO.

    python3 scripts/gerar-og.py

É a imagem que aparece quando alguém cola o endereço no WhatsApp, Instagram,
Facebook ou LinkedIn. Sem ela o link vira uma caixa cinza com a URL crua — e
num produto que cresce por indicação, isso é o primeiro contato de muita gente.

1200x630 é o formato que todas as plataformas aceitam sem recortar mal. O
conteúdo fica dentro de uma margem folgada porque algumas cortam as beiradas.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from marca import AMEIXA, AREIA, BRASA, RAIO, marca  # noqa: E402

LARGURA, ALTURA = 1200, 630
SAIDA = Path(__file__).resolve().parent.parent / 'public' / 'og.png'

# Fontes do sistema. O site usa Fraunces e Inter, que vêm do Google Fonts e não
# existem aqui — DejaVu Serif e DejaVu Sans são as parentes mais próximas em
# peso e proporção. A imagem é gerada uma vez e versionada; não vale arrastar
# um arquivo de fonte para o repositório por causa dela.
SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
SANS = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def fonte(caminho, tamanho):
    return ImageFont.truetype(caminho, tamanho)


def largura_do_texto(d, texto, f):
    caixa = d.textbbox((0, 0), texto, font=f)
    return caixa[2] - caixa[0]


def main():
    s = RAIO  # desenha 4x maior e reduz, para a borda sair limpa
    img = Image.new('RGB', (LARGURA * s, ALTURA * s), AMEIXA[:3])
    d = ImageDraw.Draw(img)

    # Um brilho suave no canto superior esquerdo tira a chapa do fundo liso.
    brilho = Image.new('RGB', (LARGURA * s, ALTURA * s), (129, 94, 178))
    mascara = Image.new('L', (LARGURA * s, ALTURA * s), 0)
    md = ImageDraw.Draw(mascara)
    md.ellipse([-300 * s, -420 * s, 760 * s, 400 * s], fill=90)
    img = Image.composite(brilho, img, mascara)
    d = ImageDraw.Draw(img)

    # A marca à esquerda, do mesmo desenho dos ícones.
    m = 300 * s
    marca(d, 96 * s, (ALTURA * s - m) / 2, m, contorno=AMEIXA)

    x = 470 * s

    # Nome. Cai um corpo se algum dia o nome crescer, em vez de vazar da imagem.
    for corpo in (92, 80, 68, 58):
        f_nome = fonte(SERIF, corpo * s)
        if largura_do_texto(d, 'QICONEXÃO', f_nome) <= (LARGURA - 470 - 80) * s:
            break
    d.text((x, 214 * s), 'QICONEXÃO', font=f_nome, fill=AREIA[:3])

    # Um traço da cor da brasa entre o nome e a promessa.
    d.rounded_rectangle([x, 336 * s, (x + 92 * s), 344 * s], radius=4 * s, fill=BRASA[:3])

    f_frase = fonte(SANS, 34 * s)
    d.text((x, 378 * s), 'Antes de escolher alguém,', font=f_frase, fill=(233, 226, 243))
    d.text((x, 424 * s), 'conheça alguém.', font=f_frase, fill=(233, 226, 243))

    f_pe = fonte(SANS, 24 * s)
    d.text((x, 498 * s), 'conexao.qidominios.com.br', font=f_pe, fill=(191, 174, 219))

    img = img.resize((LARGURA, ALTURA), Image.LANCZOS)
    img.save(SAIDA, optimize=True)
    print(f'  {SAIDA.name}  {LARGURA}x{ALTURA}  {SAIDA.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
