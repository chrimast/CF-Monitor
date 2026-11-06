import { createHash } from 'node:crypto'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0CDC85B1'

export function websocketAcceptKey(key) {
  return createHash('sha1').update(String(key) + GUID).digest('base64')
}

export function encodeWsFrame(data, opcode = 1) {
  const payload = Buffer.from(data)
  const length = payload.length
  let header
  if (length < 126) {
    header = Buffer.alloc(2)
    header[0] = 0x80 | opcode
    header[1] = length
  } else if (length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  return Buffer.concat([header, payload])
}

export function decodeWsFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset]
    const second = buffer[offset + 1]
    const opcode = first & 0x0f
    const masked = (second & 0x80) !== 0
    let length = second & 0x7f
    let cursor = offset + 2
    if (length === 126) {
      if (cursor + 2 > buffer.length) break
      length = buffer.readUInt16BE(cursor)
      cursor += 2
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break
      length = Number(buffer.readBigUInt64BE(cursor))
      cursor += 8
    }
    const mask = masked ? 4 : 0
    if (cursor + mask + length > buffer.length) break
    let payload = buffer.subarray(cursor + mask, cursor + mask + length)
    if (masked) {
      const key = buffer.subarray(cursor, cursor + 4)
      payload = Buffer.from(payload)
      for (let i = 0; i < payload.length; i++) payload[i] ^= key[i % 4]
    }
    frames.push({ opcode, payload })
    offset = cursor + mask + length
  }
  return { frames, rest: buffer.subarray(offset) }
}

export function bridgeSocketToWebSocket(socket, webSocket, head = Buffer.alloc(0)) {
  let leftover = Buffer.from(head)
  socket.on('data', (chunk) => {
    leftover = Buffer.concat([leftover, chunk])
    const decoded = decodeWsFrames(leftover)
    leftover = decoded.rest
    for (const frame of decoded.frames) {
      if (frame.opcode === 8) {
        webSocket.close()
        socket.end()
        return
      }
      if (frame.opcode === 9) {
        socket.write(encodeWsFrame(frame.payload, 10))
        continue
      }
      if (frame.opcode === 1 || frame.opcode === 2) {
        webSocket.send(frame.payload.toString('utf8'))
      }
    }
  })
  webSocket.addEventListener('message', (event) => {
    if (socket.destroyed) return
    socket.write(encodeWsFrame(String(event.data ?? '')))
  })
  webSocket.addEventListener('close', () => {
    if (!socket.destroyed) socket.end()
  })
  socket.on('close', () => webSocket.close())
  socket.on('error', () => webSocket.close())
}

export function writeUpgradeResponse(socket, key) {
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${websocketAcceptKey(key)}\r\n` +
    '\r\n'
  )
}
