/**
 * API Router for Cloudflare Workers
 * Handles all API endpoints for the E-Voting system
 */

// Helper function to create JSON response
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    });
}

// Helper function to hash data using SHA-256
async function sha256(data) {
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper function to generate session token
function generateSessionToken() {
    return crypto.randomUUID();
}

// Helper function to verify session
async function verifySession(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);
    
    const session = await env.DB.prepare(
        'SELECT user_hash FROM sessions WHERE id = ? AND expires_at > datetime("now")'
    ).bind(token).first();

    return session ? session.user_hash : null;
}

// API Routes Handler
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/', '');
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        });
    }

    try {
        // Route: GET /elections - Get all elections (active and closed)
        if (path === 'elections' && method === 'GET') {
            const activeElections = await env.DB.prepare(`
                SELECT e.*, 
                    json_group_array(json_object(
                        'id', c.id,
                        'name', c.name,
                        'description', c.description,
                        'candidate_index', c.candidate_index
                    )) as candidates
                FROM elections e
                LEFT JOIN candidates c ON e.id = c.election_id
                WHERE e.status IN ('pending', 'active')
                    AND datetime(e.end_date) > datetime('now')
                GROUP BY e.id
                ORDER BY e.start_date DESC
            `).all();

            const closedElections = await env.DB.prepare(`
                SELECT e.*,
                    json_group_array(json_object(
                        'id', c.id,
                        'name', c.name,
                        'description', c.description,
                        'candidate_index', c.candidate_index
                    )) as candidates
                FROM elections e
                LEFT JOIN candidates c ON e.id = c.election_id
                WHERE e.status IN ('closed', 'finalized')
                    OR datetime(e.end_date) <= datetime('now')
                GROUP BY e.id
                ORDER BY e.end_date DESC
            `).all();

            // Parse JSON candidates
            const parseElections = (elections) => elections.map(e => ({
                ...e,
                candidates: JSON.parse(e.candidates).filter(c => c.id !== null)
            }));

            return jsonResponse({
                active: parseElections(activeElections.results || []),
                closed: parseElections(closedElections.results || [])
            });
        }

        // Route: GET /elections/active - Get only active elections
        if (path === 'elections/active' && method === 'GET') {
            const elections = await env.DB.prepare(`
                SELECT e.*,
                    json_group_array(json_object(
                        'id', c.id,
                        'name', c.name,
                        'description', c.description,
                        'candidate_index', c.candidate_index
                    )) as candidates
                FROM elections e
                LEFT JOIN candidates c ON e.id = c.election_id
                WHERE e.status IN ('pending', 'active')
                    AND datetime(e.end_date) > datetime('now')
                GROUP BY e.id
                ORDER BY e.start_date DESC
            `).all();

            const parsedElections = (elections.results || []).map(e => ({
                ...e,
                candidates: JSON.parse(e.candidates).filter(c => c.id !== null)
            }));

            return jsonResponse(parsedElections);
        }

        // Route: GET /elections/closed - Get closed elections (for finalization)
        if (path === 'elections/closed' && method === 'GET') {
            const elections = await env.DB.prepare(`
                SELECT e.*
                FROM elections e
                WHERE e.status IN ('active', 'closed')
                    AND datetime(e.end_date) <= datetime('now')
                ORDER BY e.end_date DESC
            `).all();

            return jsonResponse(elections.results || []);
        }

        // Route: GET /elections/finalizeable - Get elections ready for finalization
        if (path === 'elections/finalizeable' && method === 'GET') {
            const userHash = await verifySession(request, env);
            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            // Check if user is commission member
            const user = await env.DB.prepare(
                'SELECT is_commission FROM users WHERE user_hash = ?'
            ).bind(userHash).first();

            if (!user || user.is_commission !== 1) {
                return jsonResponse({ error: 'Forbidden - Commission only' }, 403);
            }

            const elections = await env.DB.prepare(`
                SELECT e.*,
                    (SELECT COUNT(*) FROM votes WHERE election_id = e.id) as vote_count,
                    (SELECT COUNT(DISTINCT user_hash) FROM key_shares WHERE election_id = e.id) as shares_count,
                    (SELECT COUNT(*) FROM finalization_votes WHERE election_id = e.id) as finalization_votes_count
                FROM elections e
                WHERE e.status IN ('active', 'closed')
                ORDER BY 
                    CASE WHEN e.status = 'active' THEN 0 ELSE 1 END,
                    e.end_date DESC
            `).all();

            return jsonResponse({ elections: elections.results || [] });
        }

        // Route: GET /elections/:id - Get specific election
        if (path.match(/^elections\/\d+$/) && method === 'GET') {
            const electionId = path.split('/')[1];

            const election = await env.DB.prepare(`
                SELECT * FROM elections WHERE id = ?
            `).bind(electionId).first();

            if (!election) {
                return jsonResponse({ error: 'Election not found' }, 404);
            }

            const candidates = await env.DB.prepare(`
                SELECT * FROM candidates WHERE election_id = ? ORDER BY candidate_index
            `).bind(electionId).all();

            return jsonResponse({
                ...election,
                candidates: candidates.results || []
            });
        }

        // Route: POST /auth/login - User login
        if (path === 'auth/login' && method === 'POST') {
            const body = await request.json();
            const { userHash, passwordHash } = body;

            if (!userHash || !passwordHash) {
                return jsonResponse({ error: 'Missing credentials' }, 400);
            }

            // Check user exists
            const user = await env.DB.prepare(
                'SELECT * FROM users WHERE user_hash = ? AND password_hash = ?'
            ).bind(userHash, passwordHash).first();

            if (!user) {
                return jsonResponse({ error: 'Invalid credentials' }, 401);
            }

            // Create session
            const sessionToken = generateSessionToken();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

            await env.DB.prepare(
                'INSERT INTO sessions (id, user_hash, expires_at) VALUES (?, ?, ?)'
            ).bind(sessionToken, userHash, expiresAt).run();

            return jsonResponse({
                success: true,
                sessionToken,
                userHash,
                is_commission: user.is_commission === 1
            });
        }

        // Route: GET /auth/verify - Verify session token
        if (path === 'auth/verify' && method === 'GET') {
            const userHash = await verifySession(request, env);
            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            const user = await env.DB.prepare(
                'SELECT is_commission FROM users WHERE user_hash = ?'
            ).bind(userHash).first();

            return jsonResponse({
                success: true,
                user_hash: userHash,
                is_commission: user.is_commission === 1
            });
        }

        // Route: GET /votes/check - Check if user has voted
        if (path === 'votes/check' && method === 'GET') {
            const sessionUserHash = await verifySession(request, env);
            if (!sessionUserHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            const electionId = url.searchParams.get('election');
            const userHash = url.searchParams.get('userHash');

            if (!electionId || !userHash) {
                return jsonResponse({ error: 'Missing parameters' }, 400);
            }

            // Ensure users can only check their own vote status
            if (sessionUserHash !== userHash) {
                return jsonResponse({ error: 'Forbidden' }, 403);
            }

            const vote = await env.DB.prepare(
                'SELECT voted_at FROM votes WHERE election_id = ? AND user_hash = ?'
            ).bind(electionId, userHash).first();

            return jsonResponse({
                hasVoted: !!vote,
                votedAt: vote?.voted_at
            });
        }

        // Route: POST /votes/cast - Cast a vote
        if (path === 'votes/cast' && method === 'POST') {
            const userHash = await verifySession(request, env);
            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            const body = await request.json();
            const { electionId, encryptedVote } = body;

            if (!electionId || !encryptedVote) {
                return jsonResponse({ error: 'Missing data' }, 400);
            }

            // Check if election is active or pending (allow voting in both)
            const election = await env.DB.prepare(
                `SELECT * FROM elections 
                 WHERE id = ? 
                 AND status IN ('pending', 'active')
                 AND datetime(end_date) > datetime('now')`
            ).bind(electionId).first();

            if (!election) {
                return jsonResponse({ error: 'Election not active' }, 400);
            }

            // Check if user already voted
            const existingVote = await env.DB.prepare(
                'SELECT id FROM votes WHERE election_id = ? AND user_hash = ?'
            ).bind(electionId, userHash).first();

            if (existingVote) {
                return jsonResponse({ error: 'Already voted' }, 409);
            }

            // Store encrypted vote (now single value instead of array, due to CRT compression)
            await env.DB.prepare(
                'INSERT INTO votes (election_id, user_hash, encrypted_vote) VALUES (?, ?, ?)'
            ).bind(electionId, userHash, encryptedVote).run();

            // Aggregate votes using homomorphic properties
            await aggregateVotes(env, electionId);

            return jsonResponse({ success: true });
        }

        // Route: POST /elections/create - Create new election
        if (path === 'elections/create' && method === 'POST') {
            // Verify user is commission member
            const userHash = await verifySession(request, env);
            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            const user = await env.DB.prepare(
                'SELECT is_commission FROM users WHERE user_hash = ?'
            ).bind(userHash).first();

            if (!user || user.is_commission !== 1) {
                return jsonResponse({ error: 'Only commission members can create elections' }, 403);
            }

            const body = await request.json();
            const { name, description, startDate, endDate, publicKey, threshold, totalShares, keyShares, candidates } = body;

            if (!name || !startDate || !endDate || !publicKey || !threshold || !totalShares || !candidates) {
                return jsonResponse({ error: 'Missing required fields' }, 400);
            }

            // Verify there are exactly 5 commission members
            const commissionMembers = await env.DB.prepare(
                'SELECT user_hash FROM users WHERE is_commission = 1 LIMIT 5'
            ).all();

            if (!commissionMembers.results || commissionMembers.results.length !== 5) {
                return jsonResponse({ error: 'System must have exactly 5 commission members' }, 400);
            }

            // Determine status based on dates
            const now = new Date();
            const start = new Date(startDate);
            const end = new Date(endDate);
            let status = 'pending';
            if (now >= start && now < end) status = 'active';
            if (now >= end) status = 'closed';

            // Create election
            const electionResult = await env.DB.prepare(`
                INSERT INTO elections (name, description, start_date, end_date, status, public_key_n, public_key_g, threshold, total_shares)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                name,
                description || '',
                startDate,
                endDate,
                status,
                publicKey.n,
                publicKey.g,
                threshold,
                totalShares
            ).run();

            const electionId = electionResult.meta.last_row_id;

            // Insert candidates
            for (const candidate of candidates) {
                await env.DB.prepare(
                    'INSERT INTO candidates (election_id, name, description, candidate_index) VALUES (?, ?, ?, ?)'
                ).bind(electionId, candidate.name, candidate.description || '', candidate.candidate_index).run();
            }

            // Assign key shares to commission members
            // keyShares[i] format: "x,y" where x is share index (0-4) and y is share value
            for (let i = 0; i < keyShares.length && i < commissionMembers.results.length; i++) {
                const member = commissionMembers.results[i];
                const [shareIndex, shareValue] = keyShares[i].split(',');
                await env.DB.prepare(
                    'INSERT INTO key_shares (election_id, user_hash, share_index, share_value) VALUES (?, ?, ?, ?)'
                ).bind(electionId, member.user_hash, parseInt(shareIndex), shareValue).run();
            }

            // Initialize encrypted result with E(0) = 1 (identity element for Paillier)
            // NOTE: With CRT encoding, we store a single encrypted value instead of array
            await env.DB.prepare(
                'UPDATE elections SET encrypted_result = ? WHERE id = ?'
            ).bind('1', electionId).run();

            return jsonResponse({ success: true, electionId });
        }

        // Route: GET /key-shares/my-fragments - Get current user's key fragments
        if (path === 'key-shares/my-fragments' && method === 'GET') {
            const userHash = await verifySession(request, env);
            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            const user = await env.DB.prepare(
                'SELECT is_commission FROM users WHERE user_hash = ?'
            ).bind(userHash).first();

            if (!user || user.is_commission !== 1) {
                return jsonResponse({ error: 'Only commission members can access key fragments' }, 403);
            }

            const fragments = await env.DB.prepare(`
                SELECT 
                    ks.election_id,
                    e.name as election_name,
                    e.status,
                    e.threshold,
                    e.total_shares,
                    ks.share_index,
                    ks.share_value
                FROM key_shares ks
                JOIN elections e ON ks.election_id = e.id
                WHERE ks.user_hash = ?
                ORDER BY e.created_at DESC
            `).bind(userHash).all();

            // Format fragments to include key_share in "x,y" format for frontend
            const formattedFragments = (fragments.results || []).map(frag => ({
                ...frag,
                key_share: `${frag.share_index},${frag.share_value}`
            }));

            return jsonResponse({ fragments: formattedFragments });
        }

        // Route: POST /elections/:id/close - Close election manually
        if (path.match(/^elections\/\d+\/close$/) && method === 'POST') {
            const userHash = await verifySession(request, env);
            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            const user = await env.DB.prepare(
                'SELECT is_commission FROM users WHERE user_hash = ?'
            ).bind(userHash).first();

            if (!user || user.is_commission !== 1) {
                return jsonResponse({ error: 'Only commission members can close elections' }, 403);
            }

            const electionId = path.split('/')[1];

            // Check if election exists and is active
            const election = await env.DB.prepare(
                'SELECT * FROM elections WHERE id = ? AND status IN (?, ?)'
            ).bind(electionId, 'pending', 'active').first();

            if (!election) {
                return jsonResponse({ error: 'Election not found or already closed' }, 404);
            }

            // Close the election
            await env.DB.prepare(
                `UPDATE elections SET status = 'closed', end_date = datetime('now') WHERE id = ?`
            ).bind(electionId).run();

            return jsonResponse({ success: true, message: 'Election closed successfully' });
        }

        // Route: POST /elections/:id/vote-finalize - Commission member votes to finalize election
        if (path.match(/^elections\/\d+\/vote-finalize$/) && method === 'POST') {
            const userHash = await verifySession(request, env);
            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            // Check if user is commission member
            const user = await env.DB.prepare(
                'SELECT is_commission FROM users WHERE user_hash = ?'
            ).bind(userHash).first();

            if (!user || !user.is_commission) {
                return jsonResponse({ error: 'Only commission members can vote to finalize' }, 403);
            }

            const electionId = path.split('/')[1];

            // Check if election exists and is active or closed
            const election = await env.DB.prepare(
                'SELECT * FROM elections WHERE id = ? AND status IN (?, ?)'
            ).bind(electionId, 'active', 'closed').first();

            if (!election) {
                return jsonResponse({ error: 'Election not found or already finalized' }, 404);
            }

            // Check if user already voted
            const existingVote = await env.DB.prepare(
                'SELECT * FROM finalization_votes WHERE election_id = ? AND user_hash = ?'
            ).bind(electionId, userHash).first();

            if (existingVote) {
                return jsonResponse({ error: 'You have already voted to finalize this election' }, 400);
            }

            // Add finalization vote
            await env.DB.prepare(
                'INSERT INTO finalization_votes (election_id, user_hash) VALUES (?, ?)'
            ).bind(electionId, userHash).run();

            // Count total finalization votes
            const voteCount = await env.DB.prepare(
                'SELECT COUNT(*) as count FROM finalization_votes WHERE election_id = ?'
            ).bind(electionId).first();

            // Check if threshold reached (3 out of 5)
            if (voteCount.count >= election.threshold) {
                // Automatically finalize: collect key shares from voters
                const shares = await env.DB.prepare(
                    `SELECT ks.share_index, ks.share_value
                     FROM key_shares ks
                     INNER JOIN finalization_votes fv ON ks.user_hash = fv.user_hash AND ks.election_id = fv.election_id
                     WHERE ks.election_id = ?
                     ORDER BY ks.share_index
                     LIMIT ?`
                ).bind(electionId, election.threshold).all();

                if (!shares.results || shares.results.length < election.threshold) {
                    // Fallback: get any 3 shares if not enough from voters
                    const fallbackShares = await env.DB.prepare(
                        `SELECT share_index, share_value
                         FROM key_shares
                         WHERE election_id = ?
                         ORDER BY share_index
                         LIMIT ?`
                    ).bind(electionId, election.threshold).all();
                    
                    if (!fallbackShares.results || fallbackShares.results.length < election.threshold) {
                        return jsonResponse({ 
                            error: 'Not enough key shares available',
                            votes: voteCount.count,
                            threshold: election.threshold
                        }, 400);
                    }
                    
                    // Use fallback shares
                    return jsonResponse({ 
                        success: true,
                        autoFinalize: true,
                        message: 'Threshold reached! Election will be automatically finalized.',
                        votes: voteCount.count,
                        threshold: election.threshold,
                        shares: fallbackShares.results.map(s => ({
                            x: parseInt(s.share_index),
                            y: s.share_value
                        }))
                    });
                }

                // Close election if still active
                if (election.status === 'active') {
                    await env.DB.prepare(
                        `UPDATE elections SET status = 'closed', end_date = datetime('now') WHERE id = ?`
                    ).bind(electionId).run();
                }

                return jsonResponse({ 
                    success: true,
                    autoFinalize: true,
                    message: 'Threshold reached! Election will be automatically finalized.',
                    votes: voteCount.count,
                    threshold: election.threshold,
                    shares: shares.results.map(s => ({
                        x: parseInt(s.share_index),
                        y: s.share_value
                    }))
                });
            }

            return jsonResponse({ 
                success: true,
                autoFinalize: false,
                message: 'Vote recorded. Waiting for more votes.',
                votes: voteCount.count,
                threshold: election.threshold
            });
        }

        // Route: GET /elections/:id/finalization-status - Get finalization voting status
        if (path.match(/^elections\/\d+\/finalization-status$/) && method === 'GET') {
            const electionId = path.split('/')[1];

            const votes = await env.DB.prepare(
                `SELECT fv.user_hash, fv.created_at, u.is_commission
                 FROM finalization_votes fv
                 JOIN users u ON fv.user_hash = u.user_hash
                 WHERE fv.election_id = ?`
            ).bind(electionId).all();

            const election = await env.DB.prepare(
                'SELECT threshold, total_shares, status FROM elections WHERE id = ?'
            ).bind(electionId).first();

            return jsonResponse({
                votes: votes.results || [],
                count: votes.results?.length || 0,
                threshold: election?.threshold || 3,
                totalShares: election?.total_shares || 5,
                status: election?.status,
                thresholdReached: (votes.results?.length || 0) >= (election?.threshold || 3)
            });
        }

        // Route: GET /elections/:id/votes/count - Get vote count for an election
        if (path.match(/^elections\/\d+\/votes\/count$/) && method === 'GET') {
            const electionId = path.split('/')[1];

            const result = await env.DB.prepare(
                'SELECT COUNT(*) as count FROM votes WHERE election_id = ?'
            ).bind(electionId).first();

            return jsonResponse({ count: result?.count || 0 });
        }

        // Route: POST /elections/:id/close - Close election (for manual finalization)
        if (path.match(/^elections\/\d+\/close$/) && method === 'POST') {
            const userHash = await verifySession(request, env);
            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            // Check if user is commission member
            const user = await env.DB.prepare(
                'SELECT is_commission FROM users WHERE user_hash = ?'
            ).bind(userHash).first();

            if (!user || !user.is_commission) {
                return jsonResponse({ error: 'Only commission members can close elections' }, 403);
            }

            const electionId = path.split('/')[1];

            // Update election status to closed
            await env.DB.prepare(
                `UPDATE elections SET status = 'closed', end_date = datetime('now') WHERE id = ?`
            ).bind(electionId).run();

            return jsonResponse({ success: true });
        }

        // Route: GET /commission/my-fragments - Get logged-in user's key fragments
        if (path === 'commission/my-fragments' && method === 'GET') {
            const userHash = await verifySession(request, env);
            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            const fragments = await env.DB.prepare(`
                SELECT ks.*, e.name as election_name
                FROM key_shares ks
                JOIN elections e ON ks.election_id = e.id
                WHERE ks.user_hash = ?
                ORDER BY ks.created_at DESC
            `).bind(userHash).all();

            return jsonResponse(fragments.results || []);
        }

        // Route: GET /commission/my-fragment/:electionId - Get user's fragment for specific election
        if (path.match(/^commission\/my-fragment\/\d+$/) && method === 'GET') {
            const userHash = await verifySession(request, env);
            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            const electionId = path.split('/')[2];

            const fragment = await env.DB.prepare(
                'SELECT share_value, share_index FROM key_shares WHERE election_id = ? AND user_hash = ?'
            ).bind(electionId, userHash).first();

            if (!fragment) {
                return jsonResponse({ error: 'Fragment not found' }, 404);
            }

            return jsonResponse(fragment);
        }

        // Route: GET /elections/:id/encrypted-results - Get encrypted results
        if (path.match(/^elections\/\d+\/encrypted-results$/) && method === 'GET') {
            const electionId = path.split('/')[1];

            const election = await env.DB.prepare(
                'SELECT encrypted_result FROM elections WHERE id = ?'
            ).bind(electionId).first();

            if (!election || !election.encrypted_result) {
                return jsonResponse({ error: 'No results available' }, 404);
            }

            // Return single encrypted value (CRT-encoded aggregate)
            return jsonResponse({
                encryptedResult: election.encrypted_result
            });
        }

        // Route: POST /elections/finalize - Finalize election with decrypted results
        if (path === 'elections/finalize' && method === 'POST') {
            const userHash = await verifySession(request, env);
            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            const user = await env.DB.prepare(
                'SELECT is_commission FROM users WHERE user_hash = ?'
            ).bind(userHash).first();

            if (!user || user.is_commission !== 1) {
                return jsonResponse({ error: 'Only commission members can finalize elections' }, 403);
            }

            const body = await request.json();
            const { electionId, decryptedResults } = body;

            if (!electionId || !decryptedResults) {
                return jsonResponse({ error: 'Missing data' }, 400);
            }

            await env.DB.prepare(`
                UPDATE elections 
                SET status = 'finalized', decrypted_result = ?
                WHERE id = ?
            `).bind(JSON.stringify(decryptedResults), electionId).run();

            return jsonResponse({ success: true });
        }

        // Route: POST /elections/:id/vote-finalize - Vote to finalize election (automatic mode)
        if (path.match(/^elections\/\d+\/vote-finalize$/) && method === 'POST') {
            const electionId = path.split('/')[1];
            const userHash = await verifySession(request, env);

            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            // Check if user is commission member
            const user = await env.DB.prepare(
                'SELECT is_commission FROM users WHERE user_hash = ?'
            ).bind(userHash).first();

            if (!user || user.is_commission !== 1) {
                return jsonResponse({ error: 'Only commission members can vote to finalize' }, 403);
            }

            // Check if already voted
            const existingVote = await env.DB.prepare(
                'SELECT id FROM finalization_votes WHERE election_id = ? AND user_hash = ?'
            ).bind(electionId, userHash).first();

            if (existingVote) {
                return jsonResponse({ error: 'Already voted to finalize this election' }, 400);
            }

            // Record vote
            await env.DB.prepare(
                'INSERT INTO finalization_votes (election_id, user_hash) VALUES (?, ?)'
            ).bind(electionId, userHash).run();

            // Count votes
            const voteCount = await env.DB.prepare(
                'SELECT COUNT(*) as count FROM finalization_votes WHERE election_id = ?'
            ).bind(electionId).first();

            const threshold = 3; // Fixed: 3 out of 5 commission members
            const votes = voteCount.count;

            // Check if threshold reached
            if (votes >= threshold) {
                // Get all key shares for this election - CRITICAL: must include share_index for Shamir
                const shares = await env.DB.prepare(
                    'SELECT share_value, share_index FROM key_shares WHERE election_id = ? ORDER BY share_index LIMIT ?'
                ).bind(electionId, threshold).all();

                if (shares.results && shares.results.length >= threshold) {
                    // Return {x, y} objects for proper Shamir reconstruction
                    const shareObjects = shares.results.map(s => ({
                        x: s.share_index,
                        y: s.share_value
                    }));

                    // Close election if still active
                    await env.DB.prepare(
                        'UPDATE elections SET status = ? WHERE id = ? AND status = ?'
                    ).bind('closed', electionId, 'active').run();

                    return jsonResponse({
                        success: true,
                        votes,
                        threshold,
                        autoFinalize: true,
                        shares: shareObjects
                    });
                }
            }

            return jsonResponse({
                success: true,
                votes,
                threshold,
                autoFinalize: false
            });
        }

        // Route: GET /elections/:id/finalization-status - Get finalization voting status
        if (path.match(/^elections\/\d+\/finalization-status$/) && method === 'GET') {
            const electionId = path.split('/')[1];

            const voteCount = await env.DB.prepare(
                'SELECT COUNT(*) as count FROM finalization_votes WHERE election_id = ?'
            ).bind(electionId).first();

            const voters = await env.DB.prepare(
                'SELECT user_hash, created_at FROM finalization_votes WHERE election_id = ? ORDER BY created_at'
            ).bind(electionId).all();

            const threshold = 3;
            const votes = voteCount.count;

            return jsonResponse({
                votes,
                threshold,
                thresholdReached: votes >= threshold,
                voters: voters.results || []
            });
        }

        // Route: POST /elections/:id/close - Close election manually
        if (path.match(/^elections\/\d+\/close$/) && method === 'POST') {
            const electionId = path.split('/')[1];
            const userHash = await verifySession(request, env);

            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            // Check if user is commission member
            const user = await env.DB.prepare(
                'SELECT is_commission FROM users WHERE user_hash = ?'
            ).bind(userHash).first();

            if (!user || user.is_commission !== 1) {
                return jsonResponse({ error: 'Only commission members can close elections' }, 403);
            }

            await env.DB.prepare(
                'UPDATE elections SET status = ? WHERE id = ?'
            ).bind('closed', electionId).run();

            return jsonResponse({ success: true });
        }

        // Route: POST /elections/:id/save-results - Save decrypted results
        if (path.match(/^elections\/\d+\/save-results$/) && method === 'POST') {
            const userHash = await verifySession(request, env);
            if (!userHash) {
                return jsonResponse({ error: 'Unauthorized' }, 401);
            }

            const user = await env.DB.prepare(
                'SELECT is_commission FROM users WHERE user_hash = ?'
            ).bind(userHash).first();

            if (!user || user.is_commission !== 1) {
                return jsonResponse({ error: 'Only commission members can save results' }, 403);
            }

            const electionId = path.split('/')[1];
            const body = await request.json();
            const { results } = body;

            if (!results || !Array.isArray(results)) {
                return jsonResponse({ error: 'Invalid results format' }, 400);
            }

            // Save decrypted results and mark as finalized
            await env.DB.prepare(
                `UPDATE elections 
                 SET decrypted_result = ?, status = 'finalized' 
                 WHERE id = ?`
            ).bind(JSON.stringify(results), electionId).run();

            return jsonResponse({ success: true, message: 'Results saved successfully' });
        }

        // Route: GET /results/:id - Get election results
        if (path.match(/^results\/\d+$/) && method === 'GET') {
            const electionId = path.split('/')[1];

            // Get election with candidates
            const election = await env.DB.prepare(
                'SELECT * FROM elections WHERE id = ?'
            ).bind(electionId).first();

            if (!election) {
                return jsonResponse({ error: 'Election not found' }, 404);
            }

            if (!election.decrypted_result) {
                return jsonResponse({ error: 'Results not yet available' }, 404);
            }

            // Get candidates
            const candidates = await env.DB.prepare(
                'SELECT * FROM candidates WHERE election_id = ? ORDER BY candidate_index'
            ).bind(electionId).all();

            // Parse results
            const results = JSON.parse(election.decrypted_result);

            return jsonResponse({
                election: {
                    id: election.id,
                    name: election.name,
                    description: election.description,
                    status: election.status,
                    start_date: election.start_date,
                    end_date: election.end_date
                },
                candidates: candidates.results || [],
                results: results
            });
        }

        // Default: Not found
        return jsonResponse({ error: 'Route not found' }, 404);

    } catch (error) {
        return jsonResponse({ error: error.message || 'Internal server error' }, 500);
    }
}

// Helper function to aggregate votes using homomorphic addition
// NOTE: With CRT encoding, each vote is now a SINGLE encrypted value (not an array)
// The encrypted value represents the entire vote vector compressed via CRT before encryption
async function aggregateVotes(env, electionId) {
    // Get current encrypted result
    const election = await env.DB.prepare(
        'SELECT encrypted_result, public_key_n FROM elections WHERE id = ?'
    ).bind(electionId).first();

    if (!election) return;

    const n = BigInt(election.public_key_n);
    const n2 = n * n;

    // Get all votes
    const votes = await env.DB.prepare(
        'SELECT encrypted_vote FROM votes WHERE election_id = ?'
    ).bind(electionId).all();

    if (!votes.results || votes.results.length === 0) {
        // No votes yet - initialize with E(0) = 1
        await env.DB.prepare(
            'UPDATE elections SET encrypted_result = ? WHERE id = ?'
        ).bind('1', electionId).run();
        return;
    }

    // Parse encrypted votes (each is a single BigInt string)
    // CRITICAL: Never use JSON.parse on BigInt strings - it causes precision loss!
    const encryptedVotes = votes.results.map(v => {
        try {
            return BigInt(v.encrypted_vote);
        } catch (error) {
            return null;
        }
    }).filter(v => v !== null);

    if (encryptedVotes.length === 0) return;

    // Initialize with E(0) = 1 (identity for Paillier multiplication)
    let aggregatedResult = 1n;

    // Homomorphic addition: E(m1 + m2) = E(m1) * E(m2) mod n^2
    for (let i = 0; i < encryptedVotes.length; i++) {
        aggregatedResult = (aggregatedResult * encryptedVotes[i]) % n2;
    }
    
    const finalResult = aggregatedResult.toString();

    // Store aggregated result as single value
    await env.DB.prepare(
        'UPDATE elections SET encrypted_result = ? WHERE id = ?'
    ).bind(finalResult, electionId).run();
}
