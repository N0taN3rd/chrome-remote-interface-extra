import { CRIExtra, Browser } from '../../lib'

export default async function withPage (t, run) {
  const client = await CRIExtra()
  const browser = await Browser.create(client, { ignoreHTTPSErrors: true })
  const page = await browser.newPage()
  try {
    await run(page, t)
  } finally {
    await page.close()
    await client.close()
  }
}
