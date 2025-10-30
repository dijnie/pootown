import env from './env'

export default {
  config: {
    commitment: env.solana.commitment,
    wsEndpoint: env.rpc.er.ws,
    rateLimit: env.solana.rateLimit
  }
}
