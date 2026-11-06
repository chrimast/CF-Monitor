function encodeLine(text) {
  return new TextEncoder().encode(`${text}\r\n`)
}

async function readResponse(reader) {
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (value) text += new TextDecoder().decode(value)
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
    const last = lines[lines.length - 1]
    if (last && /^[0-9]{3} /.test(last)) return text
    if (done) return text
  }
}

function b64(value) {
  return Buffer.from(String(value), 'utf8').toString('base64')
}

export async function sendMail(config, mail) {
  if (typeof globalThis.__CF_MONITOR_SMTP_SEND_MAIL === 'function') {
    return globalThis.__CF_MONITOR_SMTP_SEND_MAIL(config, mail)
  }
  const { connect } = await import('node:tls')
  const port = Number(config.port || 587)
  const useImplicitTls = config.secureTransport === 'tls' || port === 465
  const net = await import('node:net')
  const socket = useImplicitTls
    ? connect({ host: config.host, port, servername: config.host })
    : net.connect({ host: config.host, port })
  await new Promise((resolve, reject) => {
    socket.once(useImplicitTls ? 'secureConnect' : 'connect', resolve)
    socket.once('error', reject)
  })
  let stream = socket
  const write = (line) => stream.write(encodeLine(line))
  const chunks = []
  stream.on('data', (buf) => chunks.push(buf))
  const reader = {
    async read() {
      if (chunks.length) return { done: false, value: chunks.shift() }
      await new Promise((resolve) => stream.once('data', resolve))
      if (!chunks.length) return { done: true, value: undefined }
      return { done: false, value: chunks.shift() }
    }
  }
  await readResponse(reader)
  write(`EHLO cf-monitor`)
  await readResponse(reader)
  if (!useImplicitTls && config.secureTransport !== 'off') {
    write('STARTTLS')
    await readResponse(reader)
    const tls = await import('node:tls')
    stream = tls.connect({ socket, servername: config.host })
    await new Promise((resolve, reject) => {
      stream.once('secureConnect', resolve)
      stream.once('error', reject)
    })
    stream.on('data', (buf) => chunks.push(buf))
    write(`EHLO cf-monitor`)
    await readResponse(reader)
  }
  write('AUTH LOGIN')
  await readResponse(reader)
  write(b64(config.username))
  await readResponse(reader)
  write(b64(config.password))
  await readResponse(reader)
  write(`MAIL FROM:<${config.from}>`)
  await readResponse(reader)
  for (const to of config.to) {
    write(`RCPT TO:<${to}>`)
    await readResponse(reader)
  }
  write('DATA')
  await readResponse(reader)
  const subject = String(mail.subject || 'CF-Monitor')
  const text = String(mail.text || '')
  write(`From: ${config.from}`)
  write(`To: ${config.to.join(', ')}`)
  write(`Subject: ${subject}`)
  write('')
  write(text.replace(/^\./gm, '..'))
  write('.')
  await readResponse(reader)
  write('QUIT')
  stream.end()
}
