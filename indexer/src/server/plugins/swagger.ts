import Swagger from '@fastify/swagger'
import SwaggerUI from '@fastify/swagger-ui'
import { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

async function swaggerGeneratorPlugin(fastify: FastifyInstance) {
  await fastify.register(Swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Panda Monopoly Indexer API',
        description: 'API for querying monopoly game data, player statistics, and property management',
        version: process.env.npm_package_version ?? '1.0.0',
        contact: {
          name: 'Panda Monopoly API Support',
          email: 'support@pandamonopoly.io'
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT'
        }
      },
      servers: [
        {
          url: 'http://localhost:8080',
          description: 'Development server'
        },
        {
          url: 'https://api.pandamonopoly.io',
          description: 'Production server'
        }
      ],

      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'x-api-key',
            in: 'header',
            description: 'Optional API key for higher rate limits'
          }
        },
        schemas: {
          GameStatus: {
            type: 'string',
            enum: ['WaitingForPlayers', 'InProgress', 'Finished'],
            description: 'Current status of the game'
          },
          TradeStatus: {
            type: 'string',
            enum: ['Pending', 'Accepted', 'Rejected', 'Cancelled', 'Expired'],
            description: 'Status of a trade proposal'
          },
          ColorGroup: {
            type: 'string',
            enum: [
              'Brown',
              'LightBlue',
              'Pink',
              'Orange',
              'Red',
              'Yellow',
              'Green',
              'DarkBlue',
              'Railroad',
              'Utility',
              'Special'
            ],
            description: 'Property color group'
          },
          PropertyType: {
            type: 'string',
            enum: [
              'Property',
              'Street',
              'Railroad',
              'Utility',
              'Corner',
              'Chance',
              'CommunityChest',
              'Tax',
              'Beach',
              'Festival'
            ],
            description: 'Type of board space'
          },
          PubKey: {
            type: 'string',
            pattern: '^[1-9A-HJ-NP-Za-km-z]{32,44}$',
            description: 'Solana public key address'
          },
          Signature: {
            type: 'string',
            pattern: '^[1-9A-HJ-NP-Za-km-z]{87,88}$',
            description: 'Solana transaction signature'
          }
        }
      }
    }
  })

  await fastify.register(SwaggerUI, {
    routePrefix: '/api-docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true
    },
    staticCSP: true
  })

  fastify.log.info(`Swagger documentation is available at /api-docs`)
}

export default fp(swaggerGeneratorPlugin, {
  name: 'swaggerGenerator',
  fastify: '5.x'
})
