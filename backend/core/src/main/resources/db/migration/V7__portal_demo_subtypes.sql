-- V7: portal identities for the demo tenants (plans/ui-portals-plan.md §2.2).
-- The 4 FSP portals key eligibility off tenants.sub_type; the demo PSP org and
-- its client org get the builder sub-types. New migration per the immutability
-- rule (never edit settled seeds).
-- a1 = Demo PSP (Namibia)      -> MANUFACTURER portal persona (psp-admin)
-- a2 = Namib Fresh (client)    -> MERCHANT stays: no portal keyed to MERCHANT yet
UPDATE tenants SET sub_type = 'MANUFACTURER'
WHERE id = '00000000-0000-0000-0000-0000000000a1' AND sub_type IS NULL;

-- 0002 client org (from the second demo tree): DISTRIBUTOR portal persona
UPDATE tenants SET sub_type = 'DISTRIBUTOR'
WHERE id = '00000000-0000-0000-0000-000000000002' AND sub_type IS NULL;
