import os from 'node:os'
import { registerVersoRosbridgeLogRoutes } from './versoRosbridgeLogRoutes.mjs'

function getLanMonitorUrls(port) {
  const urls = []
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${port}/verso-log`)
      }
    }
  }
  return urls
}

function mountVersoRosbridgeLog(server) {
  registerVersoRosbridgeLogRoutes(server.middlewares)

  server.httpServer?.once('listening', () => {
    const address = server.httpServer?.address()
    const port = typeof address === 'object' && address ? address.port : null
    console.log('[verso-rosbridge] dev log hub mounted (/verso-rosbridge-log/*)')
    if (port) {
      console.log(`[verso-rosbridge] iPad monitor (same Wi-Fi): http://localhost:${port}/verso-log`)
      for (const url of getLanMonitorUrls(port)) {
        console.log(`[verso-rosbridge] iPad monitor (LAN): ${url}`)
      }
    }
  })
}

/** Vite dev: 브라우저 rosbridge 연결 로그 → npm run dev 터미널 + LAN 모니터 페이지 */
export function versoRosbridgeLogPlugin() {
  return {
    name: 'verso-rosbridge-log',
    configureServer(server) {
      mountVersoRosbridgeLog(server)
    },
    configurePreviewServer(server) {
      mountVersoRosbridgeLog(server)
    },
  }
}
