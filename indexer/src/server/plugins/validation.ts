import { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'

async function validationPlugin(fastify: FastifyInstance) {
  const ajv = new Ajv({
    removeAdditional: true, // Remove additional properties not in schema
    useDefaults: true, // Apply default values from schema
    coerceTypes: true, // Type coercion
    allErrors: true // Return all errors, not just the first
  })

  // Add formats like date-time, email, etc.
  addFormats(ajv)

  // Add monopoly-specific formats
  ajv.addFormat('pubkey', /^[1-9A-HJ-NP-Za-km-z]{32,44}$/) // Solana pubkey format
  ajv.addFormat('signature', /^[1-9A-HJ-NP-Za-km-z]{87,88}$/) // Solana signature format
  ajv.addFormat('gameStatus', /^(WaitingForPlayers|InProgress|Finished)$/)
  ajv.addFormat('tradeStatus', /^(Pending|Accepted|Rejected|Cancelled|Expired)$/)
  ajv.addFormat('colorGroup', /^(Brown|LightBlue|Pink|Orange|Red|Yellow|Green|DarkBlue|Railroad|Utility|Special)$/)
  ajv.addFormat('propertyType', /^(Property|Street|Railroad|Utility|Corner|Chance|CommunityChest|Tax|Beach|Festival)$/)
  ajv.addFormat('boardPosition', (value: string) => {
    const num = parseInt(value, 10)
    return Number.isInteger(num) && num >= 0 && num <= 39
  })
  ajv.addFormat('diceValue', (value: string) => {
    const num = parseInt(value, 10)
    return Number.isInteger(num) && num >= 1 && num <= 6
  })
  ajv.addFormat('positiveInteger', (value: string) => {
    const num = parseInt(value, 10)
    return Number.isInteger(num) && num > 0
  })
  ajv.addFormat('nonNegativeInteger', (value: string) => {
    const num = parseInt(value, 10)
    return Number.isInteger(num) && num >= 0
  })

  // Custom keywords for monopoly validation
  ajv.addKeyword({
    keyword: 'isValidRent',
    type: 'number',
    schemaType: 'boolean',
    compile: () => (data: number) => data >= 0 && data <= 10000 // Max reasonable rent
  })

  ajv.addKeyword({
    keyword: 'isValidPlayerCount',
    type: 'number',
    schemaType: 'boolean',
    compile: () => (data: number) => data >= 2 && data <= 6 // Standard monopoly player limits
  })

  // Set as the validator for Fastify
  fastify.setValidatorCompiler(({ schema }) => {
    return ajv.compile(schema)
  })

  fastify.log.info('Monopoly validation configured with custom formats and keywords')
}

export default fp(validationPlugin, {
  name: 'validation',
  fastify: '5.x'
})
