#!/usr/bin/env python3
# Pictures for a packed vehicle, as WebP files the page loads by name (see SPEC in src/render/vehmodels.js).
#   vehicle_tex.py <textures dir> <out dir> <job> [<job> ...]
# A job is  kind:source[,source2]:outname:size[:quality]
#   c   colour picture (transparency kept if the source has any)            c:RU_T72B3_Standard_BaseColor.png:t72_c:2048
#   n   normal map                                                          n:RU_T72B3_Normal.png:t72_n:1024
#   rm  roughness and metallic packed the way the 3D library reads them     rm:RU_T72B3_Roughness.png,RU_T72B3_Metallic.png:t72_rm:1024
#       (green = roughness, blue = metallic)
import sys, os
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src, out = sys.argv[1:3]; os.makedirs(out, exist_ok=True)
for job in sys.argv[3:]:
    a = job.split(':'); kind, names, name, size = a[0], a[1].split(','), a[2], int(a[3]); q = int(a[4]) if len(a) > 4 else (90 if kind == 'n' else 84)
    ims = [Image.open(os.path.join(src, n)) for n in names]
    if kind == 'rm':
        r, m = [im.convert('L').resize((size, size), Image.LANCZOS) for im in ims]; im = Image.merge('RGB', (Image.new('L', (size, size), 255), r, m))
    else:
        im = ims[0]; alpha = im.mode in ('RGBA', 'LA') and im.getchannel('A').getextrema()[0] < 250
        im = im.convert('RGBA' if alpha and kind == 'c' else 'RGB').resize((size, size), Image.LANCZOS)
    p = os.path.join(out, name + '.webp'); im.save(p, 'WEBP', quality=q, method=6); print(p, im.mode, im.size, os.path.getsize(p))
