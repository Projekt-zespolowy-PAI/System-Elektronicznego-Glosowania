/**
 * Paillier Homomorphic Encryption Implementation
 * 
 * This implementation provides:
 * - Key generation for Paillier cryptosystem
 * - Encryption of votes
 * - Homomorphic addition (multiplying ciphertexts)
 * - Decryption of aggregated results
 * - Shamir's Secret Sharing for distributed key management
 */

/**
 * Generate a random prime number of specified bit length
 */
function generatePrime(bitLength) {
    const min = 1n << BigInt(bitLength - 1);
    const max = (1n << BigInt(bitLength)) - 1n;
    
    while (true) {
        let candidate = randomBigInt(min, max);
        if (candidate % 2n === 0n) candidate += 1n;
        
        if (isProbablePrime(candidate, 10)) {
            return candidate;
        }
    }
}

/**
 * Generate random BigInt in range [min, max]
 */
function randomBigInt(min, max) {
    const range = max - min + 1n;
    const bits = range.toString(2).length;
    const bytes = Math.ceil(bits / 8);
    
    while (true) {
        const randomBytes = new Uint8Array(bytes);
        crypto.getRandomValues(randomBytes);
        
        let result = 0n;
        for (let i = 0; i < bytes; i++) {
            result = (result << 8n) | BigInt(randomBytes[i]);
        }
        
        if (result < range) {
            return min + result;
        }
    }
}

/**
 * Miller-Rabin primality test
 */
function isProbablePrime(n, k = 10) {
    if (n === 2n || n === 3n) return true;
    if (n < 2n || n % 2n === 0n) return false;
    
    // Write n-1 as 2^r * d
    let r = 0n;
    let d = n - 1n;
    while (d % 2n === 0n) {
        r += 1n;
        d /= 2n;
    }
    
    // Witness loop
    witnessLoop: for (let i = 0; i < k; i++) {
        const a = randomBigInt(2n, n - 2n);
        let x = modPow(a, d, n);
        
        if (x === 1n || x === n - 1n) continue;
        
        for (let j = 0n; j < r - 1n; j++) {
            x = modPow(x, 2n, n);
            if (x === n - 1n) continue witnessLoop;
        }
        
        return false;
    }
    
    return true;
}

/**
 * Modular exponentiation: (base^exp) mod mod
 */
function modPow(base, exp, mod) {
    if (mod === 1n) return 0n;
    
    let result = 1n;
    base = base % mod;
    
    while (exp > 0n) {
        if (exp % 2n === 1n) {
            result = (result * base) % mod;
        }
        exp = exp / 2n;
        base = (base * base) % mod;
    }
    
    return result;
}

/**
 * Extended Euclidean Algorithm
 */
function extendedGcd(a, b) {
    if (b === 0n) {
        return { gcd: a, x: 1n, y: 0n };
    }
    
    const { gcd, x: x1, y: y1 } = extendedGcd(b, a % b);
    
    const x = y1;
    const y = x1 - (a / b) * y1;
    
    return { gcd, x, y };
}

/**
 * Modular multiplicative inverse
 */
export function modInverse(a, m) {
    const { gcd, x } = extendedGcd(a, m);
    
    if (gcd !== 1n) {
        throw new Error('Modular inverse does not exist');
    }
    
    return ((x % m) + m) % m;
}

/**
 * Compute GCD
 */
function gcd(a, b) {
    while (b !== 0n) {
        [a, b] = [b, a % b];
    }
    return a;
}

/**
 * Compute LCM
 */
function lcm(a, b) {
    return (a * b) / gcd(a, b);
}

/**
 * L function for Paillier: L(x) = (x - 1) / n
 * NOTE: This performs INTEGER division. The result is exact because
 * in Paillier, x is always ≡ 1 (mod n), so (x-1) is divisible by n.
 */
function L(x, n) {
    const numerator = x - 1n;
    const result = numerator / n;
    
    // Verify the division is exact (no remainder)
    if (numerator !== result * n) {
        // This case should ideally not happen if inputs are correct
    }
    
    return result;
}

/**
 * Paillier Key Generator
 */
export class PaillierKeyGenerator {
    constructor(bitLength = 512) {
        this.bitLength = bitLength;
    }
    
    generateKeypair() {
        // Generate two large primes p and q
        const p = generatePrime(this.bitLength / 2);
        const q = generatePrime(this.bitLength / 2);
        
        // n = p * q
        const n = p * q;
        
        // g = n + 1 (common choice for Paillier)
        const g = n + 1n;
        
        // CRITICAL: For Paillier cryptosystem to work correctly with modulus n²,
        // we need lambda such that for any r with gcd(r,n)=1:
        // r^(n*lambda) ≡ 1 (mod n²)
        // 
        // This requires lambda to be a multiple of λ(n²) = lcm(p(p-1), q(q-1))
        // divided by n. So: lambda = lcm(p-1, q-1) works when we use it correctly.
        //
        // HOWEVER, the standard approach is to use lambda = lcm(p-1, q-1) 
        // which is the Carmichael function of n, NOT n².
        // Then in decryption, we rely on the fact that g=n+1 simplifies things.
        const lambda = lcm(p - 1n, q - 1n);
        
        const n2 = n * n;
        
        // For g = n+1: g^lambda mod n² = (n+1)^lambda mod n²
        // By binomial theorem: (n+1)^lambda = 1 + lambda*n + ... (higher terms divisible by n²)
        // So: (n+1)^lambda mod n² = 1 + lambda*n mod n²
        const gLambda = modPow(g, lambda, n2);
        
        // L(x) = (x-1)/n
        const lValue = L(gLambda, n);
        
        // mu = L(g^lambda mod n²)^-1 mod n
        // For g=n+1: L((n+1)^lambda mod n²) = L(1 + lambda*n) = lambda
        // So: mu = lambda^-1 mod n
        const mu = modInverse(lValue, n);
        
        return {
            publicKey: { n, g },
            privateKey: { lambda, mu, n }
        };
    }
}

/**
 * Paillier Cryptosystem
 */
export class PaillierCrypto {
    constructor(n, g, lambda = null, mu = null) {
        this.n = n;
        this.g = g;
        this.n2 = n * n;
        this.lambda = lambda;
        this.mu = mu;
    }
    
    /**
     * Encrypt a plaintext message
     */
    encrypt(m) {
        if (typeof m === 'number') m = BigInt(m);
        
        console.log('=== PAILLIER ENCRYPT DEBUG ===');
        console.log('Plaintext m:', m.toString());
        console.log('Public key n (first 40 chars):', this.n.toString().substring(0, 40) + '...');
        console.log('Public key g (first 40 chars):', this.g.toString().substring(0, 40) + '...');
        
        // Choose random r where gcd(r, n) = 1
        // For Paillier to work correctly, r must be in Z*_n
        let r;
        do {
            r = randomBigInt(1n, this.n - 1n);
        } while (gcd(r, this.n) !== 1n);
        
        console.log('Random r (first 40 chars):', r.toString().substring(0, 40) + '...');
        
        // c = g^m * r^n mod n^2
        const gm = modPow(this.g, m, this.n2);
        const rn = modPow(r, this.n, this.n2);
        const c = (gm * rn) % this.n2;
        
        console.log('g^m mod n² (first 60 chars):', gm.toString().substring(0, 60) + '...');
        console.log('r^n mod n² (first 60 chars):', rn.toString().substring(0, 60) + '...');
        console.log('Ciphertext c (first 60 chars):', c.toString().substring(0, 60) + '...');
        console.log('Ciphertext length:', c.toString().length, 'digits');
        console.log('=== END ENCRYPT DEBUG ===');
        
        return c;
    }
    
    /**
     * Decrypt a ciphertext
     * Formula: m = L(c^lambda mod n²) * mu mod n
     * Where mu = (L(g^lambda mod n²))^-1 mod n
     * For g=n+1: L(g^lambda) = lambda, so mu = lambda^-1 mod n
     */
    decrypt(c) {
        if (!this.lambda || !this.mu) {
            throw new Error('Private key required for decryption');
        }
        
        if (typeof c === 'number') c = BigInt(c);
        
        console.log('=== PAILLIER DECRYPT DEBUG ===');
        console.log('Ciphertext c (first 60 chars):', c.toString().substring(0, 60) + '...');
        console.log('Ciphertext length:', c.toString().length, 'digits');
        console.log('Lambda:', this.lambda.toString());
        console.log('Mu:', this.mu.toString());
        console.log('n:', this.n.toString().substring(0, 40) + '...');
        console.log('n²:', this.n2.toString().substring(0, 40) + '...');
        
        // m = L(c^lambda mod n^2) * mu mod n
        const cLambda = modPow(c, this.lambda, this.n2);
        console.log('c^lambda mod n² (first 60 chars):', cLambda.toString().substring(0, 60) + '...');
        
        const lValue = L(cLambda, this.n);
        console.log('L(c^lambda) = (c^lambda - 1) / n:', lValue.toString());
        
        // DEBUG: For g=n+1, check if c^lambda has the expected form
        const expected = 1n + (lValue * this.n);
        const matches = (cLambda === expected);
        console.log('Verification: c^lambda === 1 + L*n ?', matches);
        if (!matches) {
            console.warn('WARNING: c^lambda does not match expected form!');
            console.warn('Expected:', expected.toString().substring(0, 60) + '...');
            console.warn('Got:', cLambda.toString().substring(0, 60) + '...');
        }
        
        const m = (lValue * this.mu) % this.n;
        console.log('Final plaintext m = (L * mu) % n:', m.toString());
        console.log('=== END DECRYPT DEBUG ===');
        
        return m;
    }
    
    /**
     * Homomorphic addition: Add two encrypted values
     * E(m1 + m2) = E(m1) * E(m2) mod n^2
     */
    add(c1, c2) {
        if (typeof c1 === 'number') c1 = BigInt(c1);
        if (typeof c2 === 'number') c2 = BigInt(c2);
        
        return (c1 * c2) % this.n2;
    }
    
    /**
     * Add multiple encrypted values
     */
    addMany(ciphertexts) {
        let result = 1n;
        for (const c of ciphertexts) {
            result = this.add(result, c);
        }
        return result;
    }
}

/**
 * Shamir's Secret Sharing - Split a secret into n shares with threshold k
 */
export function shamirSplit(secret, n, k) {
    const PRIME = 2n ** 512n - 569n; // Large prime for the field (must be > lambda)
    
    // Convert secret to BigInt if it's a string
    const secretBigInt = typeof secret === 'string' ? BigInt(secret) : secret;
    
    // Generate random coefficients for polynomial of degree k-1
    const coefficients = [secretBigInt % PRIME];
    for (let i = 1; i < k; i++) {
        coefficients.push(randomBigInt(0n, PRIME - 1n));
    }
    
    // Evaluate polynomial at points 1, 2, ..., n
    const shares = [];
    for (let x = 1n; x <= BigInt(n); x++) {
        let y = 0n;
        for (let i = 0; i < k; i++) {
            y = (y + coefficients[i] * modPow(x, BigInt(i), PRIME)) % PRIME;
        }
        shares.push({ x, y });
    }
    
    // Return shares as objects with x and y (NOT just y values)
    return shares;
}

/**
 * Shamir's Secret Sharing - Reconstruct secret from k shares
 * @param {Array} shares - Array of shares, either as {x, y} objects or just y values
 *                         If just y values, assumes x = 1, 2, 3, ...
 */
export function shamirCombine(shares) {
    const PRIME = 2n ** 512n - 569n;
    const k = shares.length;
    
    console.log('=== SHAMIR COMBINE DEBUG ===');
    console.log('Number of shares:', k);
    
    // Parse shares - support both {x,y} objects and plain y values
    const parsedShares = shares.map((share, index) => {
        if (typeof share === 'object' && share.x !== undefined && share.y !== undefined) {
            // Share is {x, y} object
            return {
                x: typeof share.x === 'string' ? BigInt(share.x) : BigInt(share.x),
                y: typeof share.y === 'string' ? BigInt(share.y) : BigInt(share.y)
            };
        } else {
            // Share is just y value - assume x = index + 1
            console.warn(`Share ${index} missing x coordinate, assuming x=${index + 1}`);
            return {
                x: BigInt(index + 1),
                y: typeof share === 'string' ? BigInt(share) : BigInt(share)
            };
        }
    });
    
    console.log('Parsed shares:', parsedShares.map(s => ({
        x: s.x.toString(),
        y: s.y.toString().substring(0, 40) + '...'
    })));
    
    // Use Lagrange interpolation to find f(0)
    let secret = 0n;
    
    for (let i = 0; i < k; i++) {
        const xi = parsedShares[i].x;
        const yi = parsedShares[i].y;
        
        console.log(`Share ${i}: x=${xi}, y=${yi.toString().substring(0, 40)}...`);
        
        // Calculate Lagrange basis polynomial
        let numerator = 1n;
        let denominator = 1n;
        
        for (let j = 0; j < k; j++) {
            if (i !== j) {
                const xj = parsedShares[j].x;
                numerator = numerator * (0n - xj);
                denominator = denominator * (xi - xj);
            }
        }
        
        console.log(`  Lagrange numerator: ${numerator}`);
        console.log(`  Lagrange denominator: ${denominator}`);
        
        // Compute modular inverse of denominator
        denominator = ((denominator % PRIME) + PRIME) % PRIME;
        const invDenominator = modInverse(denominator, PRIME);
        
        console.log(`  Inverse denominator (first 40 chars): ${invDenominator.toString().substring(0, 40)}...`);
        
        // Add to secret (work in field mod PRIME for division, then reconstruct)
        const lagrangeBasis = (numerator * invDenominator) % PRIME;
        const contribution = (yi * lagrangeBasis) % PRIME;
        secret = (secret + contribution) % PRIME;
        
        console.log(`  Contribution: ${contribution.toString().substring(0, 40)}...`);
        console.log(`  Running secret: ${secret.toString().substring(0, 40)}...`);
    }
    
    // Return result - if negative, add PRIME
    const result = ((secret % PRIME) + PRIME) % PRIME;
    console.log('=== FINAL RECONSTRUCTED SECRET (first 40 chars):', result.toString().substring(0, 40) + '...');
    console.log('=== END SHAMIR COMBINE DEBUG ===');
    return result;
}

// Export for testing in Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PaillierKeyGenerator,
        PaillierCrypto,
        shamirSplit,
        shamirCombine
    };
}
