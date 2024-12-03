import { config } from "dotenv";

// Load variables from .env file
const envConfig = config({ path: '.env' });

// Load variables from .env.staking file
const stakingEnvConfig = config({ path: '.env.staking' });
console.log(stakingEnvConfig);
// Define variables from .env
export const SUI_NETWORK = stakingEnvConfig.parsed?.SUI_NETWORK!;
export const GAME_LIQIUIDITY_POOL = stakingEnvConfig.parsed?.GAME_LIQUIDITY_POOL!;
export const STAKING_PACKAGE = stakingEnvConfig.parsed?.STAKING_PACKAGE!;
export const ADMIN_PHRASE = stakingEnvConfig.parsed?.ADMIN_MNEMOMIC_PHRASE!;

export const ADMIN_CAP = stakingEnvConfig.parsed?.ADMIN_CAP!;
export const E4C_PACKAGE = envConfig.parsed?.E4C_PACKAGE!;
export const PLAYER_PHRASE = stakingEnvConfig.parsed?.PLAYER_MNEMOMIC_PHRASE!;
export const STAKING_CONFIG = stakingEnvConfig.parsed?.STAKING_CONFIG!;
export const TREASURY_CAP = envConfig.parsed?.TREASURY_CAP!;