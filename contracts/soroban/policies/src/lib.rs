#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env};

#[contract]
pub struct PoliciesContract;

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SenderRule {
    Default,
    Allow,
    Block,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MailboxPolicy {
    pub allow_unknown: bool,
    pub require_verified: bool,
    pub minimum_postage: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Policy(Address),
    Rule(Address, Address),
}

#[contractimpl]
impl PoliciesContract {
    pub fn set_policy(env: Env, owner: Address, policy: MailboxPolicy) {
        owner.require_auth();
        if policy.minimum_postage < 0 {
            panic!("minimum postage cannot be negative");
        }

        env.storage()
            .persistent()
            .set(&DataKey::Policy(owner.clone()), &policy);
        env.events()
            .publish((symbol_short!("policy"), owner), policy);
    }

    pub fn get_policy(env: Env, owner: Address) -> MailboxPolicy {
        env.storage()
            .persistent()
            .get(&DataKey::Policy(owner))
            .unwrap_or(MailboxPolicy {
                allow_unknown: false,
                require_verified: true,
                minimum_postage: 0,
            })
    }

    pub fn set_sender_rule(env: Env, owner: Address, sender: Address, rule: SenderRule) {
        owner.require_auth();
        let key = DataKey::Rule(owner.clone(), sender.clone());

        if rule == SenderRule::Default {
            env.storage().persistent().remove(&key);
        } else {
            env.storage().persistent().set(&key, &rule);
        }
        env.events()
            .publish((symbol_short!("sender"), owner, sender), rule);
    }

    pub fn sender_rule(env: Env, owner: Address, sender: Address) -> SenderRule {
        env.storage()
            .persistent()
            .get(&DataKey::Rule(owner, sender))
            .unwrap_or(SenderRule::Default)
    }

    pub fn can_mail(
        env: Env,
        owner: Address,
        sender: Address,
        verified: bool,
        postage: i128,
    ) -> bool {
        match Self::sender_rule(env.clone(), owner.clone(), sender) {
            SenderRule::Allow => true,
            SenderRule::Block => false,
            SenderRule::Default => {
                let policy = Self::get_policy(env, owner);
                policy.allow_unknown
                    && (!policy.require_verified || verified)
                    && postage >= policy.minimum_postage
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Canonical interoperability vector tests
//
// Reads the language-neutral fixture at protocol/vectors/vectors.json and
// drives every primitive-validation case and every policy-decision case
// through the live Rust helpers and contract functions.  This ensures that
// CI catches any divergence between the fixture and this implementation.
//
// Space/time: O(n) — each vector case is exercised exactly once.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod vectors {
    extern crate std;

    use serde_json::Value;
    use soroban_sdk::testutils::Address as _;

    use super::*;

    const VECTORS_JSON: &str = include_str!("../../../../protocol/vectors/vectors.json");

    // -----------------------------------------------------------------------
    // Primitive-validation helpers (mirror the TypeScript Zod schemas)
    // -----------------------------------------------------------------------

    fn is_valid_stellar_address(s: &str) -> bool {
        let s = s.trim();
        s.len() == 56
            && s.starts_with('G')
            && s[1..].chars().all(|c| matches!(c, 'A'..='Z' | '2'..='7'))
    }

    fn validate_hash32(s: &str) -> Result<std::string::String, ()> {
        let normalised = s.trim().to_lowercase();
        if normalised.len() == 64
            && normalised.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f'))
        {
            Ok(normalised)
        } else {
            Err(())
        }
    }

    fn validate_stroop_amount(s: &str) -> Result<i128, ()> {
        let s = s.trim();
        if s.is_empty() || (!s.chars().all(|c| c.is_ascii_digit())) {
            return Err(());
        }
        if s != "0" && s.starts_with('0') {
            return Err(());
        }
        let val: u128 = s.parse().map_err(|_| ())?;
        if val > i128::MAX as u128 {
            return Err(());
        }
        Ok(val as i128)
    }

    // -----------------------------------------------------------------------
    // primitives/address
    // -----------------------------------------------------------------------

    #[test]
    fn primitives_address() {
        let root: Value = serde_json::from_str(VECTORS_JSON).unwrap();
        let cases = root["categories"]["primitives"]["address"]["cases"]
            .as_array()
            .unwrap();
        for c in cases {
            let id = c["id"].as_str().unwrap();
            let input = c["input"].as_str().unwrap_or("");
            let expected = c["expected"]["valid"].as_bool().unwrap();
            assert_eq!(
                is_valid_stellar_address(input),
                expected,
                "vectors: {}",
                id
            );
        }
    }

    // -----------------------------------------------------------------------
    // primitives/hash
    // -----------------------------------------------------------------------

    #[test]
    fn primitives_hash() {
        let root: Value = serde_json::from_str(VECTORS_JSON).unwrap();
        let cases = root["categories"]["primitives"]["hash"]["cases"]
            .as_array()
            .unwrap();
        for c in cases {
            let id = c["id"].as_str().unwrap();
            let input = c["input"].as_str().unwrap_or("");
            let expected = c["expected"]["valid"].as_bool().unwrap();
            let got = validate_hash32(input);
            assert_eq!(got.is_ok(), expected, "vectors: {}", id);
            if got.is_ok() {
                if let Some(exp_norm) = c["expected"]["normalized"].as_str() {
                    assert_eq!(got.unwrap(), exp_norm, "vectors: {} normalised", id);
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // primitives/amount
    // -----------------------------------------------------------------------

    #[test]
    fn primitives_amount() {
        let root: Value = serde_json::from_str(VECTORS_JSON).unwrap();
        let cases = root["categories"]["primitives"]["amount"]["cases"]
            .as_array()
            .unwrap();
        for c in cases {
            let id = c["id"].as_str().unwrap();
            let input = c["input"].as_str().unwrap_or("");
            let expected = c["expected"]["valid"].as_bool().unwrap();
            assert_eq!(
                validate_stroop_amount(input).is_ok(),
                expected,
                "vectors: {}",
                id
            );
        }
    }

    // -----------------------------------------------------------------------
    // policy_decisions — exercises the live can_mail contract function
    // -----------------------------------------------------------------------

    #[test]
    fn policy_decisions() {
        let root: Value = serde_json::from_str(VECTORS_JSON).unwrap();
        let cases = root["categories"]["policy_decisions"]["cases"]
            .as_array()
            .unwrap();

        for c in cases {
            let id = c["id"].as_str().unwrap();
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register(PoliciesContract, ());
            let client = PoliciesContractClient::new(&env, &contract_id);
            let owner = soroban_sdk::Address::generate(&env);
            let sender = soroban_sdk::Address::generate(&env);

            // Apply sender rule from fixture
            match c["setup"]["senderRule"].as_str().unwrap_or("default") {
                "allow" => client.set_sender_rule(&owner, &sender, &SenderRule::Allow),
                "block" => client.set_sender_rule(&owner, &sender, &SenderRule::Block),
                _ => {}
            }

            // Apply mailbox policy from fixture (if present)
            if let Some(policy_obj) = c["setup"]["policy"].as_object() {
                let min: i128 = policy_obj["minimumPostage"]
                    .as_str()
                    .unwrap_or("0")
                    .parse()
                    .unwrap();
                client.set_policy(
                    &owner,
                    &MailboxPolicy {
                        allow_unknown: policy_obj["allowUnknown"].as_bool().unwrap(),
                        require_verified: policy_obj["requireVerified"].as_bool().unwrap(),
                        minimum_postage: min,
                    },
                );
            }

            let postage: i128 = c["input"]["postage"].as_str().unwrap().parse().unwrap();
            let verified = c["input"]["verified"].as_bool().unwrap();
            let expected = c["expected"]["allowed"].as_bool().unwrap();

            assert_eq!(
                client.can_mail(&owner, &sender, &verified, &postage),
                expected,
                "vectors: {}",
                id
            );
        }
    }

    // -----------------------------------------------------------------------
    // tampered — all cases must be rejected by the relevant validator
    // -----------------------------------------------------------------------

    #[test]
    fn tampered() {
        let root: Value = serde_json::from_str(VECTORS_JSON).unwrap();
        let cases = root["categories"]["tampered"]["cases"]
            .as_array()
            .unwrap();
        for c in cases {
            let id = c["id"].as_str().unwrap();
            let schema = c["schema"].as_str().unwrap();
            let input = c["input"].as_str().unwrap_or("");
            let valid = match schema {
                "stellarAddress" => is_valid_stellar_address(input),
                "hash32" => validate_hash32(input).is_ok(),
                "stroopAmount" => validate_stroop_amount(input).is_ok(),
                _ => panic!("unknown schema: {schema}"),
            };
            assert!(!valid, "vectors: {id} should be invalid");
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn owner_controls_who_can_mail() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(PoliciesContract, ());
        let client = PoliciesContractClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        let trusted = Address::generate(&env);
        let blocked = Address::generate(&env);
        let unknown = Address::generate(&env);

        client.set_policy(
            &owner,
            &MailboxPolicy {
                allow_unknown: true,
                require_verified: true,
                minimum_postage: 100,
            },
        );
        client.set_sender_rule(&owner, &trusted, &SenderRule::Allow);
        client.set_sender_rule(&owner, &blocked, &SenderRule::Block);

        assert!(client.can_mail(&owner, &trusted, &false, &0));
        assert!(!client.can_mail(&owner, &blocked, &true, &1000));
        assert!(!client.can_mail(&owner, &unknown, &false, &100));
        assert!(client.can_mail(&owner, &unknown, &true, &100));
    }
}
