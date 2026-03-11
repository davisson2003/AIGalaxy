/**
 * upload-to-ipfs.js
 * 将 agent 元数据 JSON 上传到 IPFS，返回 agentURI 供 ERC-8004 注册使用。
 *
 * 推荐免费方案：
 *   - Pinata   (pinata.cloud)  — 1 GB 免费
 *   - NFT.Storage (nft.storage) — 基于 Filecoin
 *   - web3.storage
 *
 * npm install @pinata/sdk dotenv
 */

import PinataClient from '@pinata/sdk'
import fs from 'fs'
import 'dotenv/config'

const pinata = new PinataClient(
  process.env.PINATA_API_KEY,
  process.env.PINATA_SECRET_KEY
)

async function uploadAgentMetadata(metadataPath) {
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))

  // 验证必填字段
  const required = ['type', 'name', 'description']
  for (const f of required) {
    if (!metadata[f]) throw new Error(`Missing required field: ${f}`)
  }

  // 验证 type 值
  const VALID_TYPE = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1'
  if (metadata.type !== VALID_TYPE) {
    throw new Error(`Invalid type. Must be: ${VALID_TYPE}`)
  }

  console.log('Uploading metadata to IPFS via Pinata...')
  const result = await pinata.pinJSONToIPFS(metadata, {
    pinataMetadata: { name: `${metadata.name}-agent-metadata` },
    pinataOptions:  { cidVersion: 1 }
  })

  const agentURI = `ipfs://${result.IpfsHash}`
  console.log('✅ Uploaded!')
  console.log('   CID      :', result.IpfsHash)
  console.log('   agentURI :', agentURI)
  console.log('   Gateway  :', `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`)
  console.log()
  console.log('下一步：使用此 agentURI 调用 ERC-8004 Identity Registry:')
  console.log(`   identityRegistry.register("${agentURI}")`)

  return agentURI
}

uploadAgentMetadata('./agent-metadata-example.json').catch(console.error)
