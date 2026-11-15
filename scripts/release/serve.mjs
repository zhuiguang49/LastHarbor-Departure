import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateRelease } from './build-static.mjs'

const root = path.resolve(fileURLToPath(new URL('../../dist/', import.meta.url)))
const {manifest} = await validateRelease(root)
const base = manifest.base
const port = Number(process.env.HARBOR_PORT || 4181)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid port')
const mime = { '.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.glb':'model/gltf-binary','.ogg':'audio/ogg','.md':'text/plain; charset=utf-8' }
http.createServer(async (request,response) => {
  try {
    if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405).end(); return }
    const url = new URL(request.url, 'http://localhost')
    const pathname = decodeURIComponent(url.pathname)
    if (pathname === '/favicon.ico') { response.writeHead(204).end(); return }
    if (!pathname.startsWith(base)) { response.writeHead(404).end(); return }
    let file = path.resolve(root, pathname.slice(base.length))
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return }
    if ((await fs.stat(file)).isDirectory()) {
      if (!pathname.endsWith('/')) { response.writeHead(302,{Location:url.pathname+'/'+url.search}).end(); return }
      file = path.join(file,'index.html')
    }
    const bytes = await fs.readFile(file)
    response.writeHead(200,{'Content-Type':mime[path.extname(file)] || (['CNAME','LICENSE','NOTICE'].includes(path.basename(file)) ? 'text/plain; charset=utf-8' : 'application/octet-stream'),'Cache-Control':'no-store'})
    response.end(request.method === 'HEAD' ? undefined : bytes)
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Static file unavailable')
  }
}).listen(port,'127.0.0.1',()=>console.log(`Last Harbor: http://127.0.0.1:${port}${base}`))
