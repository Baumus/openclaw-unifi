import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCompatibilityConfig, stateMigrations } from "../dist/doctor-contract-api.js";

test("Doctor preserves retained SecretRef settings and unrelated config without mutation", () => {
 const cfg={plugins:{entries:{unifi:{config:{apiKey:{source:"store",provider:"default",id:"synthetic"},setupBinding:"OPENCLAW_UNIFI_"+"A".repeat(32)}}}},unrelated:{preserved:true}};
 const before=structuredClone(cfg);
 const result=normalizeCompatibilityConfig({cfg});
 assert.equal(result.config,cfg);assert.deepEqual(cfg,before);assert.deepEqual(result.changes,[]);assert.equal(result.warnings,undefined);assert.deepEqual(stateMigrations,[]);
});

test("Doctor rejects unsupported retained input without leaking its contents or changing settings", () => {
 for(const config of [{apiKey:"private-test-token"},{unexpected:"private-test-token"},{requestTimeoutMs:0}]){
  const cfg={plugins:{entries:{unifi:{config}}}};const before=structuredClone(cfg);const result=normalizeCompatibilityConfig({cfg});
  assert.deepEqual(result.config,before);assert.deepEqual(result.changes,[]);assert.equal(result.warnings.length,1);assert.ok(!JSON.stringify(result.warnings).includes("private-test-token"));
 }
});

test("Doctor accepts absent configuration without synthesizing settings", () => {
 const cfg={};assert.deepEqual(normalizeCompatibilityConfig({cfg}),{config:cfg,changes:[]});
});
