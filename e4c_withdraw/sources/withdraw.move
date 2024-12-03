module e4c_withdraw::claim{

    use sui::balance::{Self,Balance};
    use sui::clock::Clock;
    use sui::event;
    use sui::coin::{Self,Coin};
    use e4c::e4c::E4C;
    use e4c_staking::config::{
        annualized_interest_rate_bp,
        get_staking_rule,
        staking_quantity_range,
        staking_reward,
        StakingConfig, AdminCap};
    use e4c_staking::staking::{
        StakingReceipt,
        Staked,
        Unstaked,
        GameLiquidityPool,
        e4c_tokens_request,
    };
    // === Errors ===
    const EStakingQuantityTooLow: u64 = 0;
    const EStakingQuantityTooHigh: u64 = 1;
    const EStakingTimeNotEnded: u64 = 2;
    const EAmountMustBeGreaterThanZero: u64 = 3;
    const EAmountTooHigh: u64 = 4;

    public fun e4c_tokens_withdraw(
        liquidity_pool: &mut GameLiquidityPool,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<E4C> {
        e4c_tokens_request(liquidity_pool, amount, ctx)

    }



}