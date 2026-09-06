"""
A marca do QICONEXÃO, desenhada em código.

Vive separada porque dois lugares precisam dela: os ícones do celular
(gerar-icones.py) e a imagem de compartilhamento (gerar-og.py). Duplicar o
desenho seria duplicar a identidade — e no dia de mudar a cor, mudar uma só.

São duas balas de fala se sobrepondo: a conversa antes da aparência, que é a
tese do produto. Sem letras dentro, de propósito — assim a marca sobrevive a
uma troca de nome, como a de 06/09/2026 mostrou.
"""

from PIL import ImageDraw

AMEIXA = (110, 76, 155, 255)   # --c-brand
AREIA = (250, 246, 241, 255)   # --c-bg
BRASA = (202, 106, 67, 255)    # --c-ember
TINTA = (31, 26, 46, 255)      # --c-ink

# Supersampling: desenha N vezes maior e reduz. É o que suaviza a borda.
RAIO = 4


def bala(d: ImageDraw.ImageDraw, x, y, m, caixa, cauda, cor, inflar=0.0):
    """Uma bala de fala: retângulo arredondado mais o rabicho.

    `caixa` e `cauda` vêm em fração do lado da marca (m), para a forma não
    depender do tamanho em que está sendo gerada.
    """
    # Cada eixo com a sua origem. Já esteve escrito como uma compreensão só,
    # `(x + m * c for c in caixa)`, que somava `x` também nos valores de y — e
    # não dava erro nenhum enquanto o único uso era o ícone, quadrado e
    # centrado, onde x e y são iguais. A imagem de compartilhamento, que é
    # retangular, foi o primeiro lugar onde a marca saiu partida ao meio.
    x0, y0 = x + m * caixa[0], y + m * caixa[1]
    x1, y1 = x + m * caixa[2], y + m * caixa[3]
    i = m * inflar
    d.rounded_rectangle([x0 - i, y0 - i, x1 + i, y1 + i], radius=m * 0.17 + i, fill=cor)
    p = [(x + m * cx, y + m * cy) for cx, cy in cauda]
    if inflar:
        cx = sum(q[0] for q in p) / 3
        cy = sum(q[1] for q in p) / 3
        p = [(q[0] + (q[0] - cx) * 0.22 + (i if q[0] > cx else -i),
              q[1] + (q[1] - cy) * 0.22 + (i if q[1] > cy else -i)) for q in p]
    d.polygon(p, fill=cor)


def marca(d: ImageDraw.ImageDraw, x, y, m, contorno=AMEIXA):
    """As duas balas, na ordem em que se sobrepõem.

    `contorno` é a cor do fundo em que a marca está sendo desenhada: a bala da
    frente ganha uma borda dessa cor antes de entrar. Sem isso as duas encostam
    e viram uma mancha só no tamanho pequeno.
    """
    bala(d, x, y, m, (0.00, 0.00, 0.66, 0.50), [(0.14, 0.49), (0.31, 0.49), (0.15, 0.66)], AREIA)
    bala(d, x, y, m, (0.34, 0.36, 1.00, 0.86), [(0.69, 0.85), (0.86, 0.85), (0.85, 1.00)], contorno, inflar=0.045)
    bala(d, x, y, m, (0.34, 0.36, 1.00, 0.86), [(0.69, 0.85), (0.86, 0.85), (0.85, 1.00)], BRASA)
