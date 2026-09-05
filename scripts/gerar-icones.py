#!/usr/bin/env python3
"""
Gera os ícones do CONEXÃO para o celular.

Por que um script e não arquivos soltos: ícone é imagem binária, e imagem
binária no repositório é uma decisão que ninguém consegue revisar depois. Aqui
a forma e as cores estão escritas, então mudar a identidade é mudar duas linhas
e rodar de novo — e o diff mostra o que mudou de verdade.

    python3 scripts/gerar-icones.py

A marca são duas balas de fala se sobrepondo: a conversa antes da aparência,
que é a tese do produto. Ela precisa ser legível a 48 pixels, que é o tamanho
real na gaveta de aplicativos — por isso duas formas grandes e nenhum detalhe.
"""

from pathlib import Path
from PIL import Image, ImageDraw

AMEIXA = (110, 76, 155, 255)   # --c-brand
AREIA = (250, 246, 241, 255)   # --c-bg
BRASA = (202, 106, 67, 255)    # --c-ember

RAIO = 4  # supersampling: desenha 4x maior e reduz, que é o que suaviza a borda
SAIDA = Path(__file__).resolve().parent.parent / 'public' / 'icones'


def bala(d, x, y, m, caixa, cauda, cor, inflar=0.0):
    """Uma bala de fala: retângulo arredondado mais o rabicho.

    `caixa` e `cauda` vêm em fração do lado da marca (m), para a forma não
    depender do tamanho em que está sendo gerada.
    """
    x0, y0, x1, y1 = (x + m * c for c in caixa)
    i = m * inflar
    d.rounded_rectangle([x0 - i, y0 - i, x1 + i, y1 + i], radius=m * 0.17 + i, fill=cor)
    p = [(x + m * cx, y + m * cy) for cx, cy in cauda]
    if inflar:
        cx = sum(q[0] for q in p) / 3
        cy = sum(q[1] for q in p) / 3
        p = [(q[0] + (q[0] - cx) * 0.22 + (i if q[0] > cx else -i),
              q[1] + (q[1] - cy) * 0.22 + (i if q[1] > cy else -i)) for q in p]
    d.polygon(p, fill=cor)


def marca(d, x, y, m):
    """As duas balas, desenhadas na ordem em que se sobrepõem."""
    bala(d, x, y, m, (0.00, 0.00, 0.66, 0.50), [(0.14, 0.49), (0.31, 0.49), (0.15, 0.66)], AREIA)
    # A de trás ganha um contorno da cor do fundo antes da de frente entrar:
    # sem isso as duas encostam e viram uma mancha só no tamanho pequeno.
    bala(d, x, y, m, (0.34, 0.36, 1.00, 0.86), [(0.69, 0.85), (0.86, 0.85), (0.85, 1.00)], AMEIXA, inflar=0.045)
    bala(d, x, y, m, (0.34, 0.36, 1.00, 0.86), [(0.69, 0.85), (0.86, 0.85), (0.85, 1.00)], BRASA)


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
