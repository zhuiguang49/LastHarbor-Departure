"""Offline geometry QA image of the baked STEP, without a browser or server.

Run after convert-knife-asset.mjs: python3 scripts/harbor/convert-knife-asset.py
Pillow is used only to save the PNG; it is never a game dependency. Lighting is
diagnostic CPU shading, not a replacement for the game's existing PBR renderer.
"""
import base64
import json
import math
from pathlib import Path
import struct
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / 'assets/harbor/knife'
asset = json.loads((DIRECTORY / 'punhal.mesh.mjs').read_text().split('export const knifeAsset = ', 1)[1])
binary = base64.b64decode(asset['data'])
width, height = 1600, 1000
image = Image.new('RGB', (width, height), (28, 33, 38))
pixels = image.load()
depths = [-math.inf] * (width * height)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def unit(a):
    length = math.sqrt(dot(a, a))
    return tuple(x / length for x in a)


def unpack(record, kind):
    return struct.unpack_from('<' + str(record['length']) + kind, binary, record['offset'])


for centre_y, view in [(270, (0, 0, -1)), (740, (.62, .12, -1))]:
    camera = unit(view)
    right = unit(tuple(y - camera[i] * camera[1] for i, y in enumerate((0, 1, 0))))
    up = (camera[1]*right[2]-camera[2]*right[1], camera[2]*right[0]-camera[0]*right[2], camera[0]*right[1]-camera[1]*right[0])
    light = unit((.6, .3, -1))
    for mesh in asset['meshes']:
        positions = unpack(mesh['position'], 'f')
        normals = unpack(mesh['normal'], 'h')
        indices = unpack(mesh['index'], 'H')
        points = []
        ns = []
        colours = {'blade': (91, 103, 105), 'edge': (181, 192, 194), 'handle': (51, 58, 51)}
        base = colours[mesh['material']]
        for i in range(0, len(positions), 3):
            p = (positions[i], positions[i+1]-.042, positions[i+2])
            points.append((width/2 + 4050*dot(p, right), centre_y - 4050*dot(p, up), dot(p, camera)))
            ns.append(tuple(n/32767 for n in normals[i:i+3]))
        for i in range(0, len(indices), 3):
            ia, ib, ic = indices[i:i+3]
            a, b, c = points[ia], points[ib], points[ic]
            area = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])
            if area >= -1e-9:
                continue
            x0, x1 = max(0, int(min(a[0],b[0],c[0]))), min(width-1, math.ceil(max(a[0],b[0],c[0])))
            y0, y1 = max(0, int(min(a[1],b[1],c[1]))), min(height-1, math.ceil(max(a[1],b[1],c[1])))
            na, nb, nc = ns[ia], ns[ib], ns[ic]
            for y in range(y0, y1+1):
                for x in range(x0, x1+1):
                    u = ((b[0]-x-.5)*(c[1]-y-.5)-(b[1]-y-.5)*(c[0]-x-.5))/area
                    v = ((c[0]-x-.5)*(a[1]-y-.5)-(c[1]-y-.5)*(a[0]-x-.5))/area
                    w = 1-u-v
                    if min(u,v,w) < -1e-7:
                        continue
                    depth = u*a[2]+v*b[2]+w*c[2]
                    offset = y*width+x
                    if depth <= depths[offset]:
                        continue
                    depths[offset] = depth
                    n = unit(tuple(u*na[k]+v*nb[k]+w*nc[k] for k in range(3)))
                    diffuse = max(0, dot(n, light))
                    specular = max(0, dot(n, unit(tuple(light[k]+camera[k] for k in range(3))))) ** 32
                    shininess = 10 if mesh['material'] == 'handle' else 90
                    pixels[x,y] = tuple(min(255, int(v*(.38+.65*diffuse)+shininess*specular)) for v in base)

draw = ImageDraw.Draw(image)
draw.text((36, 25), 'USER STEP / Sergio / SolidWorks 2014 / 334.1 mm', fill=(209,218,219))
draw.text((36, 58), 'Front: four open slots + spine scallops + original curved cutting surfaces', fill=(153,170,174))
draw.text((36, 510), 'Oblique: CAD normals, moulded finger grip, guard and actual 4 mm blade thickness', fill=(153,170,174))
draw.text((36, 962), 'Geometry QA only. CPU diagnostic lighting; runtime uses the locked game g.THREE PBR materials.', fill=(153,170,174))
destination = DIRECTORY / 'geometry-qa.png'
image.save(destination)
print(destination)
