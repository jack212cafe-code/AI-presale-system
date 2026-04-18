import { test } from "node:test";
import assert from "node:assert/strict";

const { verifyEvidenceQuotes } = await import("../../agents/tor.js");

test("verifyEvidenceQuotes keeps status when quote is a substring of a KB chunk", () => {
  const chunks = [{ title: "Dell R760", content: "Intel Xeon Gold 6430 2.1 GHz 32 cores" }];
  const item = {
    compliance_checks: [{
      spec_label: "CPU",
      tor_requirement: ">= 2.0 GHz",
      product_value: "2.1 GHz",
      status: "comply",
      note: "",
      evidence_quote: "Intel Xeon Gold 6430 2.1 GHz",
      evidence_source_file: "Dell R760"
    }],
    presale_review_notes: []
  };
  const out = verifyEvidenceQuotes(item, chunks);
  assert.equal(out.compliance_checks[0].status, "comply");
  assert.equal(out.presale_review_notes.length, 0);
});

test("verifyEvidenceQuotes downgrades to review when quote is not found", () => {
  const chunks = [{ title: "Dell R760", content: "Intel Xeon Gold 6430" }];
  const item = {
    compliance_checks: [{
      spec_label: "CPU",
      tor_requirement: ">= 2.0 GHz",
      product_value: "2.1 GHz",
      status: "comply",
      note: "",
      evidence_quote: "AMD EPYC 9754 128 cores at 2.25 GHz",
      evidence_source_file: "Dell R760"
    }],
    presale_review_notes: []
  };
  const out = verifyEvidenceQuotes(item, chunks);
  assert.equal(out.compliance_checks[0].status, "review");
  assert.match(out.presale_review_notes[0], /could not be verified/i);
});

test("verifyEvidenceQuotes preserves not_comply status even if unverified", () => {
  const chunks = [{ title: "X", content: "y" }];
  const item = {
    compliance_checks: [{
      spec_label: "CPU", tor_requirement: "", product_value: "", status: "not_comply", note: "",
      evidence_quote: "made up", evidence_source_file: ""
    }],
    presale_review_notes: []
  };
  const out = verifyEvidenceQuotes(item, chunks);
  assert.equal(out.compliance_checks[0].status, "not_comply");
});

test("verifyEvidenceQuotes tolerates whitespace differences", () => {
  const chunks = [{ title: "X", content: "Intel   Xeon\tGold  6430  2.1 GHz" }];
  const item = {
    compliance_checks: [{
      spec_label: "CPU", tor_requirement: "", product_value: "", status: "comply", note: "",
      evidence_quote: "Intel Xeon Gold 6430 2.1 GHz", evidence_source_file: "X"
    }],
    presale_review_notes: []
  };
  const out = verifyEvidenceQuotes(item, chunks);
  assert.equal(out.compliance_checks[0].status, "comply");
});
