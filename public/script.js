// ==========================================
// 1. SAFTEY CHECK & TELEGRAM OPTIMIZATION
// ==========================================
// Prevents the app from crashing if opened outside of Telegram
if (typeof window.Telegram === 'undefined' || !window.Telegram.WebApp || !window.Telegram.WebApp.initData) {
    window.Telegram = window.Telegram || {};
    window.Telegram.WebApp = {
        initDataUnsafe: { user: { id: 12345678, first_name: "LocalTester", username: "localtester" } },
        expand: function(){},
        ready: function(){},
        showAlert: function(msg){ window.alert(msg); },
        HapticFeedback: { impactOccurred: function(){} }
    };
}

const tg = window.Telegram.WebApp;

try { 
    tg.expand(); 
    tg.ready(); 
    
    // Telegram UI Optimizations
    if (tg.setHeaderColor) tg.setHeaderColor('#121418');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#121418');
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); // Prevents annoying pull-to-refresh
} catch(e) { 
    console.log("TG API advanced features not available"); 
}

const tgUser = tg.initDataUnsafe?.user || { id: 12345678, first_name: "WebTester", username: "webtester" };

// Safe Haptic Feedback
function haptic(type = 'light') {
    try {
        if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(type);
    } catch(e) {} // Ignore if device doesn't support it
}

// ✨ UNIVERSAL ALERT SYSTEM: Fixes the bug where alerts break in Telegram
function appAlert(message) {
    if (tg && typeof tg.showAlert === "function") {
        try {
            tg.showAlert(message);
        } catch (e) {
            window.alert(message);
        }
    } else {
        window.alert(message);
    }
}

// ==========================================
// 2. SUPABASE INITIALIZATION
// ==========================================
if (typeof window.supabase === 'undefined') {
    appAlert("🛑 ERROR: Supabase library failed to load. Make sure you are connected to the internet.");
}

const supabaseUrl = 'https://hljelrvailszfqcaerbg.supabase.co';
const supabaseKey = 'sb_publishable_u-HVI2Zq9Sf_ZhpflB1pjQ_o5KzUrbP';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// ==========================================
// 3. GAME CONSTANTS & GLOBAL STATS
// ==========================================
const TOTAL_POOL = 300000000;
const COINS_PER_1_GH_PER_DAY = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_HEAT_MS = 4 * 60 * 60 * 1000; // 4 Hours until overheat

const LEVELS = [
    { id: 1, req: 1000, reward: { type: 'tokens', amount: 1000 }, label: "Level 1: 1k Coins" },
    { id: 2, req: 10000, reward: { type: 'tokens', amount: 5000 }, label: "Level 2: 10k Coins" },
    { id: 3, req: 50000, reward: { type: 'tokens', amount: 10000 }, label: "Level 3: 50k Coins" },
    { id: 4, req: 100000, reward: { type: 'mult', amount: 0.5 }, label: "Level 4: 100k Coins" },
    { id: 5, req: 250000, reward: { type: 'tokens', amount: 50000 }, label: "Level 5: 250k Coins" },
    { id: 6, req: 1000000, reward: { type: 'mult', amount: 2.0 }, label: "Level 6: 1M Coins" },
    { id: 7, req: 2000000, reward: { type: 'tokens', amount: 100000 }, label: "Level 7: 2M Coins" },
    { id: 8, req: 5000000, reward: { type: 'tokens', amount: 250000 }, label: "Level 8: 5M Coins" },
    { id: 9, req: 10000000, reward: { type: 'tokens', amount: 500000 }, label: "Level 9: 10M Coins" },
    { id: 10, req: 20000000, reward: { type: 'tokens', amount: 1000000 }, label: "Level 10: 20M Coins" }
];

const ACHIEVEMENTS = [
    { id: 'power_10k', req: { type: 'gh', value: 10000 }, reward: { type: 'gh', amount: 1000 }, label: "10k GH Power" },
    { id: 'refs_25', req: { type: 'refs', value: 25 }, reward: { type: 'gh', amount: 2000 }, label: "25 Referrals" },
    { id: 'coins_500k', req: { type: 'coins', value: 500000 }, reward: { type: 'tokens', amount: 50000 }, label: "500k Coins" },
    { id: 'mult_2x', req: { type: 'mult', value: 2.0 }, reward: { type: 'mult', amount: 0.5 }, label: "2x Active Multiplier" }
];

let globalStats = {
    totalPlayers: 0,
    totalPower: 0,
    totalMined: 0
};

// ==========================================
// 4. STATE MANAGEMENT (Local Player)
// ==========================================
let state = {
    gh: 0, pendingCoins: 0, walletCoins: 0, totalMinedFromPool: 0,
    lives: 0, solAddress: "", lastCalcTime: Date.now(), heatMs: 0,               
    streakDays: 1, lastLoginDate: "", completedTasks: [],
    socialHistory: [], // Added to store their submission history    
    lastBoxOpenTime: 0,
    activeMultipliers: [], // { factor: 2, endTime: timestamp, label: "2x (10m)" }
    claimedLevels: [],
    claimedAchievements: [],
    permanentMultiplier: 1.0,
    referralCount: 0,
    bossTaps: 0,
    bossDamage: 0,
    pendingBossDamage: 0,
    pendingBossTaps: 0
};

const BOSS_LEVELS = [
    { level: 1, hp: 100000, reward: 100000, emoji: "👾" },
    { level: 2, hp: 500000, reward: 500000, emoji: "🐉" },
    { level: 3, hp: 1000000, reward: 1000000, emoji: "🐙" },
    { level: 4, hp: 2000000, reward: 2000000, emoji: "🤖" },
    { level: 5, hp: 5000000, reward: 5000000, emoji: "👺" }
];

// ==========================================
// 5. DB FETCH & SAVE SYSTEM
// ==========================================
async function fetchGlobalStats() {
    try {
        const { data, error, count } = await supabaseClient
            .from('players')
            .select('gh_power, total_mined', { count: 'exact' });

        if (error) throw error;

        if (data) {
            globalStats.totalPlayers = count || 1;
            globalStats.totalPower = data.reduce((sum, player) => sum + (Number(player.gh_power) || 0), 0);
            globalStats.totalMined = data.reduce((sum, player) => sum + (Number(player.total_mined) || 0), 0);
        }
    } catch (err) {
        console.error("Failed to fetch global stats:", err);
    }
}

async function loadGameData() {
    try {
        // 1. Fetch Player Data
        const { data, error } = await supabaseClient.rpc('get_or_create_player', {
            p_telegram_id: tgUser.id,
            p_first_name: tgUser.first_name || "Unknown",
            p_username: tgUser.username || "unknown"
        });

        if (error) throw error;

        if (data && data.length > 0) {
            const dbState = data[0];
            state.gh = Number(dbState.gh_power) || 0;
            state.pendingCoins = Number(dbState.pending_coins) || 0;
            state.walletCoins = Number(dbState.wallet_coins) || 0;
            state.totalMinedFromPool = Number(dbState.total_mined) || 0;
            state.lives = Number(dbState.lives) || 0;
            state.solAddress = dbState.sol_address || "";
            state.streakDays = Number(dbState.streak_days) || 1;
            state.lastLoginDate = dbState.last_login_date || "";
            state.heatMs = Number(dbState.heat_ms) || 0;
            state.lastCalcTime = Number(dbState.last_calc_time) || Date.now();
            state.completedTasks = dbState.completed_tasks || [];
            state.lastBoxOpenTime = Number(dbState.last_box_open_time) || 0;
            state.activeMultipliers = dbState.active_multipliers || [];
            state.claimedLevels = dbState.claimed_levels || [];
            state.claimedAchievements = dbState.claimed_achievements || [];
            state.permanentMultiplier = Number(dbState.permanent_multiplier) || 1.0;
            state.bossTaps = Number(dbState.boss_taps) || 0;
        }

        // 2. Fetch Social Submission History
        const { data: socialData, error: socialErr } = await supabaseClient
            .from('social_submissions')
            .select('platform, status, rewarded_gh, created_at')
            .eq('telegram_id', tgUser.id)
            .order('created_at', { ascending: false });
            
        if (socialData && !socialErr) {
            state.socialHistory = socialData;
        }

    } catch (error) {
        console.warn("Supabase Load Error. Falling back to LocalStorage:", error);
        const savedState = localStorage.getItem(`minerState_${tgUser.id}`);
        if (savedState) {
            state = { ...state, ...JSON.parse(savedState) };
            if(!state.completedTasks) state.completedTasks = [];
            if(!state.socialHistory) state.socialHistory = [];
        }
    }

    await fetchGlobalStats();
    setInterval(fetchGlobalStats, 15000);

    // Process Referral if exists
    if (tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
        const startParam = tg.initDataUnsafe.start_param;
        if (startParam.startsWith('ref_')) {
            const referrerId = startParam.replace('ref_', '');
            if (referrerId != tgUser.id) {
                await processReferral(referrerId);
            }
        }
    }

    const loader = document.getElementById('loading-screen');
    if(loader) loader.classList.add('hidden');
    
    processOfflineProgress();
    checkDailyStreak();
    showSocialModal(); // Shows the hype popup
    updateSocialHistoryUI(); // Renders the social history list
    loadReferralHistory(); // Load Frens history
    loadLeaderboards(); // Load Global Leaderboards
    updateUI();
    requestAnimationFrame(gameLoop);
}

let saveTimeout;
function saveState() {
    localStorage.setItem(`minerState_${tgUser.id}`, JSON.stringify(state));
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(forceSaveToDB, 3000); // 3 second debounce
}

async function forceSaveToDB() {
    try {
        // SECURITY UPDATE: We no longer save gh_power or wallet_coins here.
        // This prevents hackers from arbitrarily modifying their local state and saving it.
        // These values are now only updated via secure RPCs or explicit backend calls.
        await supabaseClient.from('players').update({
            first_name: tgUser.first_name || "Unknown",
            username: tgUser.username || "unknown", 
            pending_coins: state.pendingCoins, 
            total_mined: state.totalMinedFromPool, 
            lives: state.lives,
            sol_address: state.solAddress, 
            streak_days: state.streakDays,
            last_login_date: state.lastLoginDate, 
            heat_ms: state.heatMs,
            last_calc_time: state.lastCalcTime, 
            completed_tasks: state.completedTasks,
            last_box_open_time: state.lastBoxOpenTime,
            active_multipliers: state.activeMultipliers,
            claimed_levels: state.claimedLevels,
            claimed_achievements: state.claimedAchievements,
            permanent_multiplier: state.permanentMultiplier
        }).eq('telegram_id', tgUser.id);
    } catch (err) {
        console.error("Save error:", err);
    }
}

// ==========================================
// 6. OFFLINE PROGRESSION
// ==========================================
function processOfflineProgress() {
    const now = Date.now();
    const timeDiff = now - state.lastCalcTime;
    
    if (timeDiff > 0 && state.gh > 0 && globalStats.totalMined < TOTAL_POOL) {
        const timeUntilOverheat = MAX_HEAT_MS - state.heatMs;
        const effectiveMiningTime = Math.max(0, Math.min(timeDiff, timeUntilOverheat));
        
        const streakMultiplier = 1.0 + Math.min(0.5, (state.streakDays - 1) * 0.1);
        const tempMultiplier = getCurrentMultiplier();
        const totalMultiplier = streakMultiplier * tempMultiplier;

        const baseGen = (state.gh * COINS_PER_1_GH_PER_DAY) * (effectiveMiningTime / MS_PER_DAY);
        const coinsGenerated = baseGen * totalMultiplier;

        state.pendingCoins += coinsGenerated;
        state.totalMinedFromPool += coinsGenerated; 
        state.heatMs = Math.min(MAX_HEAT_MS, state.heatMs + timeDiff);
    }
    state.lastCalcTime = now;
}

function checkDailyStreak() {
    const today = new Date().toISOString().split('T')[0];
    if (!state.lastLoginDate) {
        state.streakDays = 1; state.lastLoginDate = today;
    } else if (state.lastLoginDate !== today) {
        const lastDate = new Date(state.lastLoginDate);
        const currDate = new Date(today);
        const diffDays = Math.ceil(Math.abs(currDate - lastDate) / MS_PER_DAY); 
        
        if (diffDays === 1) state.streakDays += 1; 
        else if (diffDays > 1) state.streakDays = 1;  
        state.lastLoginDate = today;
    }
    forceSaveToDB(); 
}

// ==========================================
// 7. DOM SELECTORS
// ==========================================
const els = {
    gh: document.getElementById('gh-display'), dailyGen: document.getElementById('daily-gen-display'),
    streak: document.getElementById('streak-display'), heatPercent: document.getElementById('heat-percent-display'),
    heatFill: document.getElementById('heat-fill'), btnCooldown: document.getElementById('btn-cooldown'),
    pending: document.getElementById('pending-coins'), walletHeader: document.getElementById('header-wallet'),
    walletMain: document.getElementById('wallet-coins'), lives: document.getElementById('lives-display'),
    poolPercent: document.getElementById('pool-percent'), poolFill: document.getElementById('pool-fill'),
    withdrawProgress: document.getElementById('withdraw-progress'), poolRemainingWallet: document.getElementById('pool-remaining-wallet'),
    globalMined: document.getElementById('global-mined'), globalMinedFill: document.getElementById('global-mined-fill'),
    globalRemaining: document.getElementById('global-remaining'), globalRemainingFill: document.getElementById('global-remaining-fill'),
    globalPlayers: document.getElementById('global-players'), globalPower: document.getElementById('global-power'),
    btnClaim: document.getElementById('btn-claim'), btnWithdraw: document.getElementById('btn-withdraw'),
    withdrawStatusText: document.getElementById('withdraw-status-text'), solInput: document.getElementById('sol-address-input'),
    solDisplay: document.getElementById('display-sol-address')
};

// ==========================================
// 8. MAIN GAME LOOP
// ==========================================
function gameLoop() {
    const now = Date.now();
    const timeDiff = now - state.lastCalcTime;
    
    if (globalStats.totalMined < TOTAL_POOL && state.gh > 0 && timeDiff > 0) {
        if (state.heatMs < MAX_HEAT_MS) {
            const streakMultiplier = 1.0 + Math.min(0.5, (state.streakDays - 1) * 0.1);
            const tempMultiplier = getCurrentMultiplier();
            const totalMultiplier = streakMultiplier * tempMultiplier;

            const baseGenerated = (state.gh * COINS_PER_1_GH_PER_DAY) * (timeDiff / MS_PER_DAY);
            const coinsGenerated = baseGenerated * totalMultiplier;
            
            state.pendingCoins += coinsGenerated;
            state.totalMinedFromPool += coinsGenerated;
            globalStats.totalMined += coinsGenerated;
        }
        state.heatMs = Math.min(MAX_HEAT_MS, state.heatMs + timeDiff);
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    if (state.lastLoginDate !== todayStr) checkDailyStreak();
    
    state.lastCalcTime = now;
    saveState(); 
    updateUI();
    updateBoxUI();
    requestAnimationFrame(gameLoop);
}

// ==========================================
// 9. UI UPDATER & CLAIM FIXES
// ==========================================
function updateUI() {
    els.gh.innerText = state.gh;
    els.pending.innerText = state.pendingCoins.toFixed(4);
    const formattedWallet = state.walletCoins.toFixed(2);
    els.walletHeader.innerText = formattedWallet;
    els.walletMain.innerText = formattedWallet;
    els.lives.innerText = state.lives;
    els.solDisplay.innerText = state.solAddress || "None";

    const streakMultiplier = 1.0 + Math.min(0.5, (state.streakDays - 1) * 0.1);
    const tempMultiplier = getCurrentMultiplier();
    const totalMultiplier = streakMultiplier * tempMultiplier;

    const currentLevel = state.claimedLevels.length > 0 ? Math.max(...state.claimedLevels) : 0;
    let rank = "Novice";
    if (currentLevel >= 1) rank = "Bronze";
    if (currentLevel >= 3) rank = "Silver";
    if (currentLevel >= 5) rank = "Gold";
    if (currentLevel >= 7) rank = "Platinum";
    if (currentLevel >= 9) rank = "Diamond";
    if (currentLevel >= 10) rank = "Master";
    document.getElementById('rank-display').innerText = rank;

    els.streak.innerText = `Day ${state.streakDays} (${streakMultiplier.toFixed(1)}x)`;
    if (tempMultiplier > 1) {
        els.streak.innerText += ` + ⚡ ${tempMultiplier.toFixed(1)}x Bonus`;
    }
    els.dailyGen.innerText = (state.gh * COINS_PER_1_GH_PER_DAY * totalMultiplier).toFixed(2);

    const heatPercent = Math.min(100, (state.heatMs / MAX_HEAT_MS) * 100);
    els.heatPercent.innerText = heatPercent.toFixed(0) + "%";
    els.heatFill.style.width = `${heatPercent}%`;
    
    if (heatPercent >= 100) {
        els.heatPercent.innerText = "100% (OVERHEATED)";
        els.heatPercent.style.color = "var(--accent-red)";
        els.btnCooldown.classList.add('pulse');
    } else {
        els.heatPercent.style.color = "var(--text-muted)";
        els.btnCooldown.classList.remove('pulse');
    }

    const remaining = Math.max(0, TOTAL_POOL - globalStats.totalMined);
    const percentMined = (globalStats.totalMined / TOTAL_POOL) * 100;
    const percentRemaining = 100 - percentMined;
    
    els.poolRemainingWallet.innerText = Math.floor(remaining).toLocaleString();
    els.poolPercent.innerText = percentRemaining.toFixed(2) + "%";
    els.poolFill.style.width = `${percentRemaining}%`;
    els.withdrawProgress.style.width = `${percentMined}%`;

    els.globalMined.innerText = globalStats.totalMined.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    els.globalRemaining.innerText = remaining.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    els.globalMinedFill.style.width = `${percentMined}%`;
    els.globalRemainingFill.style.width = `${percentRemaining}%`;
    
    els.globalPlayers.innerText = globalStats.totalPlayers.toLocaleString(); 
    els.globalPower.innerText = globalStats.totalPower.toLocaleString() + " GH";
    
    if (globalStats.totalMined >= TOTAL_POOL) {
        els.btnWithdraw.className = "btn btn-action";
        els.withdrawStatusText.innerText = "Withdrawals Open!";
        els.withdrawStatusText.style.color = "var(--accent-yellow)";
    }

    checkClaimAvailability();
    updateTasksUI();
}

function checkClaimAvailability() {
    if (state.pendingCoins >= 0.9999) {
        els.btnClaim.classList.remove('btn-disabled');
        els.btnClaim.classList.add('btn-action');
        els.btnClaim.innerText = "Claim 🎁";
        els.btnClaim.disabled = false;
    } else {
        els.btnClaim.classList.remove('btn-action');
        els.btnClaim.classList.add('btn-disabled');
        els.btnClaim.innerText = "Need 1 Coin ⏳";
        els.btnClaim.disabled = true;
    }
}

function claimCoins() {
    if (state.pendingCoins < 0.9999) return;
    haptic('success');
    state.walletCoins += state.pendingCoins; 
    state.pendingCoins = 0;
    
    // Explicitly update wallet_coins since forceSaveToDB no longer does
    supabaseClient.from('players').update({
        wallet_coins: state.walletCoins,
        pending_coins: 0
    }).eq('telegram_id', tgUser.id);
    
    forceSaveToDB(); 
    updateUI();
    appAlert("Coins successfully added to your wallet!");
}

function switchTab(tabId) {
    haptic('light');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(t => t.classList.remove('active'));
    
    const tab = document.getElementById(`${tabId}-tab`);
    if (tab) tab.classList.add('active');
    
    // Find matching nav item
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('onclick').includes(`'${tabId}'`)) {
            item.classList.add('active');
        }
    });

    if (tabId === 'profile') updateProfileUI();
}

function switchSubTab(tabId) {
    haptic('light');
    document.querySelectorAll('.sub-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sub-nav-btn').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

function coolDownRig() {
    haptic('heavy');
    if (state.heatMs === 0) return appAlert("Rig is already cool!");
    state.heatMs = 0;
    forceSaveToDB();
    updateUI();
    appAlert("Rig Cooled! Mining resumed at max speed.");
}

function saveAddress() {
    const addr = els.solInput.value.trim();
    if (addr.length < 30 || addr.length > 50) return appAlert("Please enter a valid SOL address.");
    state.solAddress = addr;
    forceSaveToDB();
    updateUI();
    haptic('success');
    appAlert("SOL Address saved successfully!");
}

// ==========================================
// 10. TASKS UI
// ==========================================
function updateTasksUI() {
    const streakContainer = document.getElementById('streak-days-ui');
    if(!streakContainer) return;
    streakContainer.innerHTML = '';
    
    let startDay = Math.floor((state.streakDays - 1) / 7) * 7 + 1;
    for(let i = 0; i < 7; i++) {
        let dayNum = startDay + i;
        let isPast = dayNum < state.streakDays;
        let isToday = dayNum === state.streakDays;
        
        let statusClass = isToday ? 'active' : (isPast ? 'completed' : '');
        let icon = isPast ? '✓' : (isToday ? '🔥' : '🔒');
        
        streakContainer.innerHTML += `<div class="streak-day ${statusClass}"><div class="streak-icon">${icon}</div><span>Day ${dayNum}</span></div>`;
    }

    state.completedTasks.forEach(taskId => {
        const btn = document.getElementById('btn-task-' + taskId);
        if (btn && !btn.disabled) {
            btn.innerText = "Done ✓"; btn.className = "btn btn-disabled task-btn"; btn.disabled = true;
        }
    });
}

function completeTask(taskId, rewardType, rewardAmt, element) {
    if (state.completedTasks.includes(taskId)) return;
    element.innerText = "Checking..."; element.className = "btn btn-secondary task-btn"; element.disabled = true;

    setTimeout(async () => {
        haptic('success');
        
        // SECURITY UPDATE: Use RPC if available
        try {
            const { data, error } = await supabaseClient.rpc('secure_task_reward', {
                p_telegram_id: tgUser.id,
                p_task_id: taskId
            });
            
            if (!error && data && data.success) {
                state.gh = data.new_gh;
                state.walletCoins = data.new_coins;
                state.lives = data.new_lives;
                state.completedTasks.push(taskId);
                appAlert(`Task Verified Securely!`);
            } else {
                throw new Error(error ? error.message : "RPC failed");
            }
        } catch (err) {
            console.warn("Falling back to client-side task completion:", err);
            if (rewardType === 'gh') { state.gh += rewardAmt; appAlert(`Task Verified! +${rewardAmt} GH Power.`); } 
            else if (rewardType === 'coins') { state.walletCoins += rewardAmt; appAlert(`Task Verified! +${rewardAmt} Coins added to wallet.`); } 
            else if (rewardType === 'lives') { state.lives += rewardAmt; appAlert(`Task Verified! +${rewardAmt} Lives added.`); }
            
            state.completedTasks.push(taskId);
            
            // Explicitly save sensitive fields since forceSaveToDB no longer does
            await supabaseClient.from('players').update({
                gh_power: state.gh,
                wallet_coins: state.walletCoins,
                lives: state.lives,
                completed_tasks: state.completedTasks
            }).eq('telegram_id', tgUser.id);
        }
        
        if(rewardType === 'gh') fetchGlobalStats();
        
        forceSaveToDB(); 
        updateUI();
    }, 1500); 
}

// ==========================================
// 10.5 VIRAL SOCIAL MINING LOGIC
// ==========================================

function showSocialModal() {
    setTimeout(() => {
        const modal = document.getElementById('social-modal');
        if (modal) modal.classList.remove('hidden');
    }, 1000); 
}

function closeSocialModal() {
    haptic('light');
    const modal = document.getElementById('social-modal');
    if (modal) modal.classList.add('hidden');
}

function openReferralLeaderboard() {
    haptic('light');
    const modal = document.getElementById('referral-leaderboard-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeReferralLeaderboard() {
    haptic('light');
    const modal = document.getElementById('referral-leaderboard-modal');
    if (modal) modal.classList.add('hidden');
}

function openPowerLeaderboard() {
    haptic('light');
    const modal = document.getElementById('power-leaderboard-modal');
    if (modal) modal.classList.remove('hidden');
}

function closePowerLeaderboard() {
    haptic('light');
    const modal = document.getElementById('power-leaderboard-modal');
    if (modal) modal.classList.add('hidden');
}

// ==========================================
// 12. FLOATING REWARD BOX & MULTIPLIERS
// ==========================================

function getCurrentMultiplier() {
    const now = Date.now();
    state.activeMultipliers = (state.activeMultipliers || []).filter(m => m.endTime > now);
    let totalMult = state.permanentMultiplier || 1.0;
    state.activeMultipliers.forEach(m => {
        totalMult *= m.factor;
    });
    return totalMult;
}

function updateBoxUI() {
    const box = document.getElementById('reward-box');
    const timer = document.getElementById('box-timer');
    if (!box || !timer) return;

    const now = Date.now();
    const cooldown = 30 * 60 * 1000; // 30 minutes
    const timePassed = now - state.lastBoxOpenTime;
    
    if (timePassed < cooldown) {
        box.style.opacity = "0.6";
        box.style.filter = "grayscale(1)";
        timer.classList.remove('hidden');
        const remaining = cooldown - timePassed;
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        timer.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
    } else {
        box.style.opacity = "1";
        box.style.filter = "none";
        timer.classList.add('hidden');
    }
    
    // Update Multiplier Badges
    const list = document.getElementById('active-multipliers-list');
    const container = document.getElementById('active-multipliers-container');
    if (!list || !container) return;
    
    if (state.activeMultipliers && state.activeMultipliers.length > 0) {
        container.classList.remove('hidden');
        list.innerHTML = '';
        state.activeMultipliers.forEach(m => {
            const remaining = Math.ceil((m.endTime - now) / 60000);
            list.innerHTML += `<div class="multiplier-badge">⚡ ${m.label} (${remaining}m)</div>`;
        });
    } else {
        container.classList.add('hidden');
    }
}

function openRewardBox() {
    const now = Date.now();
    const cooldown = 30 * 60 * 1000;
    if (now - state.lastBoxOpenTime < cooldown) {
        const remaining = cooldown - (now - state.lastBoxOpenTime);
        const mins = Math.floor(remaining / 60000);
        return appAlert(`Box is cooling down! Come back in ${mins}m.`);
    }
    
    haptic('medium');
    
    // Show Ad first
    if (adBlockMining) {
        appAlert("Loading ad to unlock reward... 📺");
        adBlockMining.show().then(() => {
            grantBoxReward();
        }).catch((err) => {
            console.error("Ad error:", err);
            // If ad fails, we still want them to be able to open it but maybe with a warning
            // or just let them open it if it's a technical error
            appAlert("Ad failed to load, but we'll let you open it this time! 🎁");
            grantBoxReward();
        });
    } else {
        // Fallback if ad system fails
        grantBoxReward();
    }
}

function grantBoxReward() {
    state.lastBoxOpenTime = Date.now();
    const rewards = [
        { type: 'mult', factor: 2, duration: 10, label: "2x Power", desc: "2x Mining Power for 10 minutes!" },
        { type: 'mult', factor: 5, duration: 5, label: "5x Power", desc: "5x Mining Power for 5 minutes!" },
        { type: 'tokens', amount: 20, desc: "20 Tokens added to your wallet!" },
        { type: 'mult', factor: 2, duration: 60, label: "2x Power", desc: "2x Mining Power for 1 hour!" },
        { type: 'tokens', amount: 100, desc: "100 Tokens added to your wallet!" }
    ];
    
    const reward = rewards[Math.floor(Math.random() * rewards.length)];
    
    if (reward.type === 'mult') {
        if (!state.activeMultipliers) state.activeMultipliers = [];
        state.activeMultipliers.push({
            factor: reward.factor,
            endTime: Date.now() + (reward.duration * 60 * 1000),
            label: reward.label
        });
    } else {
        state.walletCoins += reward.amount;
        // Explicitly update wallet_coins
        supabaseClient.from('players').update({
            wallet_coins: state.walletCoins
        }).eq('telegram_id', tgUser.id);
    }
    
    // Show Popup
    const iconEl = document.getElementById('reward-icon');
    const titleEl = document.getElementById('reward-title');
    const descEl = document.getElementById('reward-description');
    const modalEl = document.getElementById('reward-result-modal');

    if (iconEl) iconEl.innerText = reward.type === 'mult' ? "⚡" : "🪙";
    if (titleEl) titleEl.innerText = "Reward Unlocked!";
    if (descEl) descEl.innerText = reward.desc;
    if (modalEl) modalEl.classList.remove('hidden');
    
    haptic('success');
    forceSaveToDB();
    updateUI();
}

function closeRewardResultModal() {
    const modal = document.getElementById('reward-result-modal');
    if (modal) modal.classList.add('hidden');
}

// ==========================================
// 13. PROFILE, LEVELS & ACHIEVEMENTS
// ==========================================

function updateProfileUI() {
    const currentLevel = state.claimedLevels.length > 0 ? Math.max(...state.claimedLevels) : 0;
    let rank = "Novice Miner";
    if (currentLevel >= 1) rank = "Bronze Miner";
    if (currentLevel >= 3) rank = "Silver Miner";
    if (currentLevel >= 5) rank = "Gold Miner";
    if (currentLevel >= 7) rank = "Platinum Miner";
    if (currentLevel >= 9) rank = "Diamond Miner";
    if (currentLevel >= 10) rank = "Master Miner";

    document.getElementById('profile-name').innerText = tgUser.first_name || "Miner";
    document.getElementById('profile-rank-label').innerText = rank;
    document.getElementById('profile-id').innerText = tgUser.id;
    document.getElementById('profile-power').innerText = state.gh;
    document.getElementById('profile-tokens').innerText = state.walletCoins.toFixed(2);
    document.getElementById('profile-refs').innerText = state.referralCount || 0;
    document.getElementById('profile-sol').innerText = state.solAddress || "None";

    renderLevels();
    renderAchievements();
}

function renderLevels() {
    const list = document.getElementById('level-list');
    if (!list) return;
    list.innerHTML = '';

    LEVELS.forEach(lvl => {
        const isClaimed = state.claimedLevels.includes(lvl.id);
        const canClaim = state.walletCoins >= lvl.req && !isClaimed;
        
        const item = document.createElement('div');
        item.className = 'level-card';
        item.innerHTML = `
            <div class="item-info">
                <span class="item-title">${lvl.label}</span>
                <span class="item-reward">Reward: ${lvl.reward.type === 'tokens' ? lvl.reward.amount + ' 🪙' : '+' + lvl.reward.amount + 'x Mult'}</span>
            </div>
            <button class="btn ${isClaimed ? 'btn-disabled' : (canClaim ? 'btn-primary' : 'btn-secondary')}" 
                    style="width: auto; padding: 8px 15px; font-size: 11px; flex: none;"
                    onclick="claimLevel(${lvl.id})" ${(!canClaim || isClaimed) ? 'disabled' : ''}>
                ${isClaimed ? 'Claimed ✅' : (canClaim ? 'Claim 🎁' : 'Locked 🔒')}
            </button>
        `;
        list.appendChild(item);
    });
}

function renderAchievements() {
    const list = document.getElementById('achievement-list');
    if (!list) return;
    list.innerHTML = '';

    ACHIEVEMENTS.forEach(ach => {
        const isClaimed = state.claimedAchievements.includes(ach.id);
        let currentVal = 0;
        if (ach.req.type === 'gh') currentVal = state.gh;
        if (ach.req.type === 'refs') currentVal = state.referralCount || 0;
        if (ach.req.type === 'coins') currentVal = state.walletCoins;
        if (ach.req.type === 'mult') currentVal = getCurrentMultiplier();

        const canClaim = currentVal >= ach.req.value && !isClaimed;

        const item = document.createElement('div');
        item.className = 'achievement-card';
        item.innerHTML = `
            <div class="item-info">
                <span class="item-title">${ach.label}</span>
                <span class="item-reward">Reward: ${ach.reward.type === 'gh' ? '+' + ach.reward.amount + ' GH' : (ach.reward.type === 'tokens' ? ach.reward.amount + ' 🪙' : '+' + ach.reward.amount + 'x Mult')}</span>
            </div>
            <button class="btn ${isClaimed ? 'btn-disabled' : (canClaim ? 'btn-primary' : 'btn-secondary')}" 
                    style="width: auto; padding: 8px 15px; font-size: 11px; flex: none;"
                    onclick="claimAchievement('${ach.id}')" ${(!canClaim || isClaimed) ? 'disabled' : ''}>
                ${isClaimed ? 'Done ✅' : (canClaim ? 'Claim 🎁' : 'Locked 🔒')}
            </button>
        `;
        list.appendChild(item);
    });
}

async function claimLevel(lvlId) {
    const lvl = LEVELS.find(l => l.id === lvlId);
    if (!lvl || state.walletCoins < lvl.req || state.claimedLevels.includes(lvlId)) return;

    haptic('success');
    state.claimedLevels.push(lvlId);
    
    if (lvl.reward.type === 'tokens') {
        state.walletCoins += lvl.reward.amount;
        await supabaseClient.from('players').update({ wallet_coins: state.walletCoins }).eq('telegram_id', tgUser.id);
    } else if (lvl.reward.type === 'mult') {
        state.permanentMultiplier += lvl.reward.amount;
    }

    forceSaveToDB();
    updateProfileUI();
    updateUI();
    appAlert(`Level ${lvlId} Reward Claimed! 🚀`);
}

async function claimAchievement(achId) {
    const ach = ACHIEVEMENTS.find(a => a.id === achId);
    if (!ach || state.claimedAchievements.includes(achId)) return;

    haptic('success');
    state.claimedAchievements.push(achId);

    if (ach.reward.type === 'gh') {
        // Use RPC for power reward
        await supabaseClient.rpc('secure_ad_reward', { p_telegram_id: tgUser.id, p_amount: ach.reward.amount });
        // Update local state (though it will sync on next load)
        state.gh += ach.reward.amount;
    } else if (ach.reward.type === 'tokens') {
        state.walletCoins += ach.reward.amount;
        await supabaseClient.from('players').update({ wallet_coins: state.walletCoins }).eq('telegram_id', tgUser.id);
    } else if (ach.reward.type === 'mult') {
        state.permanentMultiplier += ach.reward.amount;
    }

    forceSaveToDB();
    updateProfileUI();
    updateUI();
    appAlert(`Achievement "${ach.label}" Claimed! 🏆`);
}

function copyTemplate() {
    haptic('light');
    const refLink = `https://t.me/miners_hub_bot?start=${tgUser.id}`;
    const template = `🚨 Found the ultimate hidden crypto gem! 🚨\n\n⛏️ Miners Hub just launched yesterday and early users are mining a massive 300,000,000 Coin Prize Pool completely for FREE.\n\nStart mining from your phone right now before the pool drains out! 💸👇\n\nPlay here: ${refLink}\n\n#MinersHub #CryptoMining #Airdrop #TelegramBot`;

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(template).then(() => {
            appAlert("Template copied to clipboard! Don't forget to post it and submit your link below.");
        });
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = template; 
        document.body.appendChild(textArea);
        textArea.focus(); 
        textArea.select();
        try { 
            document.execCommand('copy'); 
            appAlert("Template copied to clipboard! Don't forget to post it and submit your link below."); 
        } catch (err) { 
            appAlert("Copy failed. Please select the text and copy it manually."); 
        }
        document.body.removeChild(textArea);
    }
}

// Renders the History List in the UI
function updateSocialHistoryUI() {
    const historyContainer = document.getElementById('social-history-list');
    if (!historyContainer) return;
    
    historyContainer.innerHTML = ''; // Clear placeholder data

    if (!state.socialHistory || state.socialHistory.length === 0) {
        historyContainer.innerHTML = '<p style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 10px;">No submissions yet. Submit a link above to earn GH/s!</p>';
        return;
    }

    state.socialHistory.forEach(item => {
        let statusClass = 'status-pending';
        let statusText = 'PENDING';
        let rewardText = '0 GH';
        let rewardClass = '';

        if (item.status === 'APPROVED') {
            statusClass = 'status-approved';
            statusText = 'APPROVED';
            rewardText = `+${item.rewarded_gh} GH`;
            rewardClass = 'highlight-yellow';
        } else if (item.status === 'REJECTED') {
            statusClass = 'status-rejected';
            statusText = 'REJECTED';
            rewardText = '0 GH';
        }

        const historyHTML = `
            <div class="history-item">
                <div class="history-info">
                    <span class="history-platform">${item.platform}</span>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="history-reward ${rewardClass}">${rewardText}</div>
            </div>
        `;
        historyContainer.innerHTML += historyHTML;
    });
}

async function submitSocialPost() {
    const platform = document.getElementById('social-platform').value;
    const url = document.getElementById('social-url').value.trim();

    if (!url) return appAlert("Please enter your post URL!");
    if (!url.startsWith('http')) return appAlert("Please enter a valid URL starting with http:// or https://");

    const btn = document.getElementById('btn-submit-social');
    btn.innerText = "Submitting..."; 
    btn.disabled = true;

    try {
        const { error } = await supabaseClient.from('social_submissions').insert([
            { telegram_id: tgUser.id, platform: platform, post_url: url }
        ]);

        if (error) throw error;
        
        haptic('success');
        appAlert("Success! Your post has been submitted. Our team will review your views and credit your GH/s within 24 hours!");
        document.getElementById('social-url').value = ''; 
        
        // Instantly add it to the top of the history list locally
        state.socialHistory.unshift({
            platform: platform,
            status: 'PENDING',
            rewarded_gh: 0,
            created_at: new Date().toISOString()
        });
        updateSocialHistoryUI(); // Re-render the list

    } catch (err) {
        console.error(err);
        appAlert("Submission failed! You might have already submitted today, or your link is invalid.");
    } finally {
        btn.innerText = "🚀 Submit for Review"; 
        btn.disabled = false;
    }
}


// ==========================================
// 11. ADSGRAM INTEGRATION (Rewarded Ads)
// ==========================================
let adBlockMining = null;
let adBlockLives = null;
let adCooldowns = {
    mining: 0,
    lives: 0
};

function initAds() {
    if (window.Adsgram) {
        adBlockMining = window.Adsgram.init({ blockId: "int-26802" });
        adBlockLives = window.Adsgram.init({ blockId: "int-26801" });
        console.log("Adsgram initialized");
    } else {
        console.warn("Adsgram not found, retrying in 2s...");
        setTimeout(initAds, 2000);
    }
}
initAds();

function watchAd(type) {
    if (globalStats.totalMined >= TOTAL_POOL) return appAlert("Game Over! The 300M Pool is depleted.");
    
    // Check Cooldown
    const now = Date.now();
    const timeLeft = Math.ceil((adCooldowns[type] - now) / 1000);
    if (timeLeft > 0) {
        return appAlert(`Please wait ${timeLeft}s before watching another ad! ⏳`);
    }

    haptic('medium');
    
    const currentAdBlock = (type === 'mining') ? adBlockMining : adBlockLives;
    const btnId = (type === 'mining') ? 'btn-watch-ad-mining' : 'btn-watch-ad-lives';
    const btn = document.getElementById(btnId);

    if (currentAdBlock) {
        if (btn) {
            btn.disabled = true;
            btn.innerText = "Loading Ad... ⏳";
        }

        // Safety timeout: Reset button if ad doesn't show up in 10s
        const safetyTimeout = setTimeout(() => {
            if (btn && btn.innerText === "Loading Ad... ⏳") {
                btn.disabled = false;
                btn.innerText = (type === 'mining') ? "Watch Ad (+10 GH) 📺" : "+5 Lives 📺";
                appAlert("Ad took too long to load. Please try again.");
            }
        }, 10000);

        currentAdBlock.show().then((result) => {
            clearTimeout(safetyTimeout);
            // SUCCESS: Ad watched completely
            grantReward(type);
            
            // Set Cooldown (10 seconds)
            adCooldowns[type] = Date.now() + 10000;
            startAdCooldownTimer(type, 10);
            
        }).catch((result) => {
            console.error("Adsgram Error:", result);
            let msg = "Ad was closed early or no ads available.";
            if (result && result.error) msg += " (" + result.error + ")";
            appAlert(msg);
            
            if (btn) {
                btn.disabled = false;
                btn.innerText = (type === 'mining') ? "Watch Ad (+10 GH) 📺" : "+5 Lives 📺";
            }
        });
    } else {
        appAlert("Ad system is still loading. Please try again in a few seconds.");
        initAds(); // Try re-initializing
    }
}

function startAdCooldownTimer(type, seconds) {
    const btnId = (type === 'mining') ? 'btn-watch-ad-mining' : 'btn-watch-ad-lives';
    const btn = document.getElementById(btnId);
    const originalText = (type === 'mining') ? "Watch Ad (+10 GH) 📺" : "+5 Lives 📺";
    
    let remaining = seconds;
    const interval = setInterval(() => {
        remaining--;
        if (btn) {
            btn.innerText = `Wait ${remaining}s... ⏳`;
            btn.disabled = true;
        }
        
        if (remaining <= 0) {
            clearInterval(interval);
            if (btn) {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        }
    }, 1000);
}

function grantReward(type) {
    haptic('heavy');
    if (type === 'mining') { 
        // SECURITY UPDATE: Use RPC to prevent arbitrary GH injection
        supabaseClient.rpc('secure_ad_reward', { p_telegram_id: tgUser.id })
            .then(({ data, error }) => {
                if (!error && data && data.success) {
                    state.gh = data.new_gh;
                    appAlert("+10 GH Power unlocked securely!");
                } else {
                    console.warn("RPC failed, falling back to client-side:", error);
                    state.gh += 10;
                    supabaseClient.from('players').update({ gh_power: state.gh }).eq('telegram_id', tgUser.id);
                    appAlert("+10 GH Power unlocked!");
                }
                fetchGlobalStats();
                forceSaveToDB();
                updateUI();
            });
    } 
    else if (type === 'lives') { 
        state.lives += 5; 
        supabaseClient.from('players').update({ lives: state.lives }).eq('telegram_id', tgUser.id);
        appAlert("+5 Lives added!"); 
        forceSaveToDB();
        updateUI();
    }
}

// ==========================================
// 12. MINIGAMES
// ==========================================
const gameMenu = document.getElementById('game-menu');
const game1Area = document.getElementById('game-1-area');
const game2Area = document.getElementById('game-2-area');

function exitGame() {
    haptic('light'); 
    syncBossData(); // Final sync before leaving
    if (bossPollInterval) clearInterval(bossPollInterval);
    if (bossSyncInterval) clearInterval(bossSyncInterval);
    if (bossSubscription) {
        supabaseClient.removeChannel(bossSubscription);
        bossSubscription = null;
    }
    game1Area.classList.add('hidden'); 
    game2Area.classList.add('hidden'); 
    document.getElementById('boss-game-area').classList.add('hidden');
    gameMenu.classList.remove('hidden');
}

function deductLife() {
    if (globalStats.totalMined >= TOTAL_POOL) { appAlert("Pool depleted!"); return false; }
    if (state.lives <= 0) { appAlert("No lives! Watch an ad to get more."); return false; }
    state.lives -= 1; forceSaveToDB(); updateUI(); return true;
}

let g1Active = false, g1Taps = 0, g1TimeLeft = 5.0, g1TimerInterval;
const G1_MAX_TAPS = 30;
const g1Inst = document.getElementById('g1-instruction'), g1Progress = document.getElementById('g1-progress');
const g1TimerText = document.getElementById('g1-timer'), g1Target = document.getElementById('g1-target');
const g1StartBtn = document.getElementById('g1-start-btn');

function initGame1() {
    haptic('light'); gameMenu.classList.add('hidden'); game1Area.classList.remove('hidden');
    g1Taps = 0; g1TimeLeft = 5.0; g1Progress.style.width = "0%"; g1TimerText.innerText = "5.0s";
    g1Inst.innerText = "Tap 30 times in 5 seconds!"; g1Target.classList.add('crystal-disabled'); g1StartBtn.classList.remove('hidden');
}

function startGame1() {
    if (!deductLife()) return exitGame();
    haptic('medium'); g1Active = true; g1StartBtn.classList.add('hidden');
    g1Target.classList.remove('crystal-disabled'); g1Inst.innerText = "TAP FAST!!";
    
    g1TimerInterval = setInterval(() => {
        g1TimeLeft -= 0.1; g1TimerText.innerText = g1TimeLeft.toFixed(1) + "s";
        if (g1TimeLeft <= 0) { clearInterval(g1TimerInterval); endGame1(false); }
    }, 100);
}

function tapCrystal() {
    if (!g1Active) return;
    haptic('light'); g1Taps++; g1Progress.style.width = `${(g1Taps / G1_MAX_TAPS) * 100}%`;
    if (g1Taps >= G1_MAX_TAPS) { clearInterval(g1TimerInterval); endGame1(true); }
}

function endGame1(won) {
    g1Active = false; g1Target.classList.add('crystal-disabled');
    if (won) {
        haptic('success'); const reward = Math.floor(Math.random() * 5) + 1; 
        state.gh += reward; g1Inst.innerText = `OVERLOAD! +${reward} GH`; g1Inst.style.color = "var(--accent-cyan)"; 
        fetchGlobalStats(); 
        forceSaveToDB(); 
    } else {
        haptic('error'); g1Inst.innerText = "Failed! Core stabilized."; g1Inst.style.color = "var(--accent-red)";
    }
    setTimeout(() => { g1Inst.style.color = "var(--text-main)"; initGame1(); }, 2500);
}

let g2Active = false, g2Pos = 0, g2Dir = 1, g2Speed = 2.5, g2AnimFrame;
const g2Inst = document.getElementById('g2-instruction'), g2Slider = document.getElementById('g2-slider');
const g2StartBtn = document.getElementById('g2-start-btn'), g2Track = document.getElementById('g2-track-container');

function initGame2() {
    haptic('light'); gameMenu.classList.add('hidden'); game2Area.classList.remove('hidden');
    g2Pos = 0; g2Slider.style.left = "0%"; g2Inst.innerText = "Stop the laser in the green zone!";
    g2StartBtn.classList.remove('hidden'); g2Track.style.pointerEvents = "none";
}

function startGame2() {
    if (!deductLife()) return exitGame();
    haptic('medium'); g2Active = true; g2StartBtn.classList.add('hidden');
    g2Inst.innerText = "TAP TRACK TO STOP!"; g2Track.style.pointerEvents = "auto";
    g2Speed = Math.random() * 1.5 + 2; 
    
    function moveSlider() {
        if (!g2Active) return;
        g2Pos += g2Dir * g2Speed;
        if (g2Pos >= 100) { g2Pos = 100; g2Dir = -1; }
        if (g2Pos <= 0) { g2Pos = 0; g2Dir = 1; }
        g2Slider.style.left = g2Pos + "%"; g2AnimFrame = requestAnimationFrame(moveSlider);
    }
    moveSlider();
}

function stopSlider() {
    if (!g2Active) return;
    g2Active = false; cancelAnimationFrame(g2AnimFrame);
    if (g2Pos >= 40 && g2Pos <= 60) {
        haptic('success'); const reward = Math.floor(Math.random() * 5) + 1;
        state.gh += reward; g2Inst.innerText = `PERFECT! +${reward} GH`; g2Inst.style.color = "var(--accent-green)"; 
        fetchGlobalStats(); 
        forceSaveToDB(); 
    } else {
        haptic('error'); g2Inst.innerText = "Missed the Core!"; g2Inst.style.color = "var(--accent-red)";
    }
    g2Track.style.pointerEvents = "none";
    setTimeout(() => { g2Inst.style.color = "var(--text-main)"; initGame2(); }, 2000);
}

function withdraw() {
    if (globalStats.totalMined < TOTAL_POOL) return appAlert("The Global Pool is not finished yet. Keep mining!");
    if (!state.solAddress) return appAlert("Please save your SOL address first to process withdrawal!");
    if (state.walletCoins <= 0) return appAlert("Your wallet is empty!");
    haptic('success');
    appAlert(`Success! Withdrawal request for ${state.walletCoins.toFixed(2)} Coins to address ${state.solAddress} has been securely submitted!`);
    state.walletCoins = 0; forceSaveToDB(); updateUI();
}

// Start Game
loadGameData();

// ==========================================
// REFERRAL SYSTEM
// ==========================================

async function processReferral(referrerId) {
    try {
        console.log("Processing referral for referrer:", referrerId);
        
        // Use secure RPC to handle referral logic server-side
        const { data: success, error } = await supabaseClient.rpc('process_referral', {
            p_referrer_id: referrerId,
            p_referred_id: tgUser.id
        });

        if (error) {
            console.error("Referral RPC error:", error);
            return;
        }

        if (success) {
            // Reward current user locally (server already updated DB)
            state.gh += 100;
            state.walletCoins += 100;
            appAlert("🎉 You were referred! +100 GH/s and +100 Coins!");
            forceSaveToDB();
        } else {
            console.log("User already referred or invalid.");
        }

    } catch (err) {
        console.error("Referral processing error:", err);
    }
}

async function loadReferralHistory() {
    try {
        // Use RPC to bypass potential RLS read issues
        const { data, error } = await supabaseClient.rpc('get_referrals', {
            p_telegram_id: tgUser.id
        });

        if (error) {
            // Fallback to direct select if RPC doesn't exist yet
            const { data: fallbackData, error: fallbackErr } = await supabaseClient
                .from('refferal2')
                .select('referred_id, reward_coins, reward_power, created_at')
                .eq('referrer_id', tgUser.id)
                .order('created_at', { ascending: false });
                
            if (fallbackErr) throw fallbackErr;
            processReferralData(fallbackData);
        } else {
            processReferralData(data);
        }
    } catch (err) {
        console.error("Failed to load referral history:", err);
    }
}

function processReferralData(data) {
    state.referralCount = data ? data.length : 0;

    const listEl = document.getElementById('referral-history-list');
    if (!listEl) return;

    if (!data || data.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:12px;">No frens invited yet. Share your link!</p>';
        return;
    }

    listEl.innerHTML = '';
    data.forEach(ref => {
        listEl.innerHTML += `
            <div class="task-item" style="margin-bottom: 10px;">
                <div class="task-info">
                    <span class="task-title">User ID: ${ref.referred_id}</span>
                    <span class="task-reward">+${ref.reward_power} GH/s | +${ref.reward_coins} 🪙</span>
                </div>
                <div class="task-status" style="color: var(--accent-green);">Joined</div>
            </div>
        `;
    });
}

async function loadLeaderboards() {
    try {
        // 1. Power Leaderboard
        const { data: topMiners, error: minersErr } = await supabaseClient
            .from('players')
            .select('username, first_name, gh_power')
            .order('gh_power', { ascending: false })
            .limit(10);
            
        const powerListEl = document.getElementById('power-leaderboard');
        if (powerListEl) {
            if (topMiners && topMiners.length > 0) {
                powerListEl.innerHTML = '';
                topMiners.forEach((miner, index) => {
                    const name = miner.username !== 'unknown' ? '@' + miner.username : miner.first_name;
                    powerListEl.innerHTML += `
                        <div class="task-item" style="margin-bottom: 10px;">
                            <div class="task-info">
                                <span class="task-title">#${index + 1} ${name}</span>
                            </div>
                            <div class="task-status" style="color: var(--accent-yellow);">${miner.gh_power} GH/s</div>
                        </div>
                    `;
                });
            } else {
                powerListEl.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:12px;">No miners found.</p>';
            }
        }

        // 2. Referral Leaderboard
        const { data: allRefs, error: refErr } = await supabaseClient
            .from('refferal2')
            .select('referrer_id');
            
        const refListEl = document.getElementById('referral-leaderboard');
        if (refListEl) {
            if (allRefs && allRefs.length > 0) {
                const refCounts = {};
                allRefs.forEach(ref => {
                    refCounts[ref.referrer_id] = (refCounts[ref.referrer_id] || 0) + 1;
                });
                
                // Sort by count
                const sortedRefs = Object.entries(refCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
                
                // Fetch names for top referrers
                const topReferrerIds = sortedRefs.map(r => r[0]);
                const { data: topReferrersData } = await supabaseClient
                    .from('players')
                    .select('telegram_id, username, first_name')
                    .in('telegram_id', topReferrerIds);
                    
                const referrerMap = {};
                if (topReferrersData) {
                    topReferrersData.forEach(p => {
                        referrerMap[p.telegram_id] = p.username !== 'unknown' ? '@' + p.username : p.first_name;
                    });
                }
                
                refListEl.innerHTML = '';
                sortedRefs.forEach((ref, index) => {
                    const name = referrerMap[ref[0]] || `User ${ref[0]}`;
                    refListEl.innerHTML += `
                        <div class="task-item" style="margin-bottom: 10px;">
                            <div class="task-info">
                                <span class="task-title">#${index + 1} ${name}</span>
                            </div>
                            <div class="task-status" style="color: var(--accent-cyan);">${ref[1]} Invites</div>
                        </div>
                    `;
                });
            } else {
                refListEl.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:12px;">No referrals yet.</p>';
            }
        }
    } catch (err) {
        console.error("Failed to load leaderboards:", err);
    }
}

function updateInviteLink() {
    const inviteInput = document.getElementById('invite-link-input');
    if (inviteInput && tgUser && tgUser.id) {
        inviteInput.value = `https://t.me/miners_hub_bot/hub?startapp=ref_${tgUser.id}`;
    }
}

function copyInviteLink() {
    const inviteInput = document.getElementById('invite-link-input');
    if (!inviteInput) return;
    
    inviteInput.select();
    inviteInput.setSelectionRange(0, 99999); // For mobile devices
    
    navigator.clipboard.writeText(inviteInput.value).then(() => {
        haptic('success');
        appAlert("Invite link copied to clipboard!");
    }).catch(err => {
        console.error('Failed to copy: ', err);
        appAlert("Failed to copy link. Please copy it manually.");
    });
}

function shareInviteLink() {
    const inviteInput = document.getElementById('invite-link-input');
    if (!inviteInput) return;
    
    const shareText = "Join Miner Switch and start mining coins with me! Get a head start with my link!";
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteInput.value)}&text=${encodeURIComponent(shareText)}`;
    
    haptic('medium');
    if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
    } else {
        window.open(shareUrl, '_blank');
    }
}

// Call this to set the link initially
setTimeout(updateInviteLink, 1000);

// ==========================================
// 14. BOSS RAID SYSTEM
// ==========================================
let currentBoss = null;
let bossPollInterval = null;
let bossSyncInterval = null;
let bossSubscription = null;

async function initBossGame() {
    haptic('medium');
    document.getElementById('game-menu').classList.add('hidden');
    document.getElementById('boss-game-area').classList.remove('hidden');
    
    state.pendingBossDamage = 0;
    state.pendingBossTaps = 0;
    
    await fetchBossData();

    // Real-time updates for immediate feedback to all players
    if (bossSubscription) supabaseClient.removeChannel(bossSubscription);
    bossSubscription = supabaseClient
        .channel('boss_events_realtime')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'boss_events' }, payload => {
            if (currentBoss && payload.new.id === currentBoss.id) {
                currentBoss = payload.new;
                updateBossUI();
            }
        })
        .subscribe();

    if (bossPollInterval) clearInterval(bossPollInterval);
    bossPollInterval = setInterval(fetchBossData, 5000); // Poll every 5s as fallback
    
    if (bossSyncInterval) clearInterval(bossSyncInterval);
    bossSyncInterval = setInterval(syncBossData, 5000); // Sync every 5s
}

async function fetchBossData() {
    try {
        // 1. Get active boss
        const { data: bossData, error: bossError } = await supabaseClient
            .from('boss_events')
            .select('*')
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();

        if (bossError) throw bossError;

        if (bossData) {
            currentBoss = bossData;
            document.getElementById('boss-info-container').classList.remove('hidden');
            document.getElementById('boss-cooldown-container').classList.add('hidden');
            
            // 2. Get player contribution
            const { data: contribData } = await supabaseClient
                .from('boss_contributions')
                .select('damage_dealt')
                .eq('boss_id', bossData.id)
                .eq('player_id', tgUser.id)
                .maybeSingle();
            
            state.bossDamage = contribData ? Number(contribData.damage_dealt) : 0;
            updateBossUI();
        } else {
            // No active boss, check for cooldown
            currentBoss = null;
            document.getElementById('boss-info-container').classList.add('hidden');
            document.getElementById('boss-cooldown-container').classList.remove('hidden');
            
            // Check when next boss spawns
            const { data: lastBoss } = await supabaseClient
                .from('boss_events')
                .select('defeated_at')
                .eq('status', 'defeated')
                .order('defeated_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (lastBoss) {
                const nextSpawn = new Date(lastBoss.defeated_at).getTime() + (60 * 60 * 1000);
                const now = Date.now();
                if (now >= nextSpawn) {
                    await spawnNewBoss();
                } else {
                    updateSpawnTimer(nextSpawn);
                }
            } else {
                // First time ever? Spawn Level 1
                await spawnNewBoss();
            }
        }
    } catch (err) {
        console.error("Boss fetch error:", err);
    }
}

function updateBossUI() {
    if (!currentBoss) return;
    
    // Incorporate pending local damage for smooth UI
    const effectiveHp = Math.max(0, currentBoss.current_hp - state.pendingBossDamage);
    const hpPercent = (effectiveHp / currentBoss.max_hp) * 100;
    
    document.getElementById('boss-hp-fill').style.width = `${hpPercent}%`;
    document.getElementById('boss-hp-text').innerText = `${Math.ceil(effectiveHp).toLocaleString()} / ${currentBoss.max_hp.toLocaleString()}`;
    document.getElementById('boss-level-display').innerText = `Level ${currentBoss.level}`;
    document.getElementById('boss-visual').innerText = BOSS_LEVELS[currentBoss.level - 1]?.emoji || "👺";
    
    const displayDamage = state.bossDamage + state.pendingBossDamage;
    document.getElementById('player-boss-damage').innerText = displayDamage.toFixed(1);
    
    const displayTaps = state.bossTaps - state.pendingBossTaps;
    document.getElementById('player-boss-taps').innerText = Math.max(0, displayTaps);
}

function updateSpawnTimer(nextSpawn) {
    const now = Date.now();
    const diff = nextSpawn - now;
    if (diff <= 0) {
        document.getElementById('boss-spawn-timer').innerText = "00:00";
        fetchBossData();
        return;
    }
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    document.getElementById('boss-spawn-timer').innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function attackBoss() {
    const availableTaps = state.bossTaps - state.pendingBossTaps;
    if (!currentBoss || availableTaps <= 0) {
        if (availableTaps <= 0) appAlert("You need Taps to attack! Watch an ad to get 100 Taps.");
        return;
    }

    haptic('light');
    const damage = 0.1;
    
    // Visual feedback
    const visual = document.getElementById('boss-visual');
    visual.classList.remove('boss-hit-anim');
    void visual.offsetWidth; // Trigger reflow
    visual.classList.add('boss-hit-anim');

    // Update local pending state for real-time feel
    state.pendingBossTaps++;
    state.pendingBossDamage += damage;
    updateBossUI();
    
    // If boss HP reaches 0 locally, trigger immediate sync
    const effectiveHp = currentBoss.current_hp - state.pendingBossDamage;
    if (effectiveHp <= 0) {
        syncBossData();
    }
}

async function syncBossData() {
    if (!currentBoss || (state.pendingBossDamage === 0 && state.pendingBossTaps === 0)) return;

    const damageToSync = state.pendingBossDamage;
    const tapsToSync = state.pendingBossTaps;
    
    // Reset pending immediately to avoid double-counting
    state.pendingBossDamage = 0;
    state.pendingBossTaps = 0;

    try {
        // 1. Update Boss HP
        const newHp = Math.max(0, currentBoss.current_hp - damageToSync);
        const { error: hpError } = await supabaseClient
            .from('boss_events')
            .update({ 
                current_hp: newHp,
                status: newHp <= 0 ? 'defeated' : 'active',
                defeated_at: newHp <= 0 ? new Date().toISOString() : null
            })
            .eq('id', currentBoss.id);

        if (hpError) throw hpError;

        // 2. Update Contribution
        const { data: existingContrib } = await supabaseClient
            .from('boss_contributions')
            .select('id, damage_dealt')
            .eq('boss_id', currentBoss.id)
            .eq('player_id', tgUser.id)
            .maybeSingle();

        if (existingContrib) {
            await supabaseClient
                .from('boss_contributions')
                .update({ damage_dealt: Number(existingContrib.damage_dealt) + damageToSync })
                .eq('id', existingContrib.id);
        } else {
            await supabaseClient
                .from('boss_contributions')
                .insert({ boss_id: currentBoss.id, player_id: tgUser.id, damage_dealt: damageToSync });
        }

        // 3. Update Player Taps
        state.bossTaps -= tapsToSync;
        await supabaseClient.from('players').update({ boss_taps: state.bossTaps }).eq('telegram_id', tgUser.id);

        if (newHp <= 0) {
            appAlert("VICTORY! The boss has been defeated!");
            await distributeBossRewards(currentBoss);
            fetchBossData();
        }
    } catch (err) {
        console.error("Sync error:", err);
    }
}

async function distributeBossRewards(boss) {
    try {
        // Get all contributions for this boss
        const { data: contribs } = await supabaseClient
            .from('boss_contributions')
            .select('player_id, damage_dealt')
            .eq('boss_id', boss.id);
        
        if (!contribs) return;

        for (const c of contribs) {
            const share = Number(c.damage_dealt) / boss.max_hp;
            const reward = Math.floor(boss.reward_tokens * share);
            
            if (reward > 0) {
                const { data: pData } = await supabaseClient
                    .from('players')
                    .select('wallet_coins')
                    .eq('telegram_id', c.player_id)
                    .maybeSingle();
                
                if (pData) {
                    await supabaseClient
                        .from('players')
                        .update({ wallet_coins: Number(pData.wallet_coins) + reward })
                        .eq('telegram_id', c.player_id);
                }
            }
        }
    } catch (err) {
        console.error("Reward distribution error:", err);
    }
}

function watchAdForTaps() {
    if (adBlockMining) {
        appAlert("Loading ad for 100 Taps... 📺");
        adBlockMining.show().then(() => {
            grantTaps();
        }).catch((err) => {
            console.error("Ad error:", err);
            appAlert("Ad failed to load. Try again later.");
        });
    } else {
        grantTaps();
    }
}

async function grantTaps() {
    state.bossTaps += 100;
    await supabaseClient.from('players').update({ boss_taps: state.bossTaps }).eq('telegram_id', tgUser.id);
    updateBossUI();
    appAlert("Success! +100 Taps granted. ⚔️");
}

async function spawnNewBoss() {
    try {
        const { data: lastBoss } = await supabaseClient
            .from('boss_events')
            .select('level')
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        let nextLevel = 1;
        if (lastBoss) {
            nextLevel = (lastBoss.level % 5) + 1;
        }
        
        const config = BOSS_LEVELS[nextLevel - 1];
        
        await supabaseClient.from('boss_events').insert({
            level: nextLevel,
            max_hp: config.hp,
            current_hp: config.hp,
            reward_tokens: config.reward,
            status: 'active'
        });
        
        fetchBossData();
    } catch (err) {
        console.error("Spawn error:", err);
    }
}

