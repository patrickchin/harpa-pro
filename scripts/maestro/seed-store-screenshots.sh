#!/usr/bin/env bash
# Seed deterministic local data for the store screenshot Maestro flow.
# Requires the repo docker-compose stack to be running.
set -euo pipefail

: "${DEV_OTP_TOKEN:?DEV_OTP_TOKEN must be set (>=32 chars). Must match the API container DEV_OTP_TOKEN.}"
if (( ${#DEV_OTP_TOKEN} < 32 )); then
  echo "DEV_OTP_TOKEN must be at least 32 chars (got ${#DEV_OTP_TOKEN})." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURE_DIR="$ROOT/apps/mobile/assets/fixtures"

docker inspect harpa-pro-pg >/dev/null
docker inspect harpa-pro-minio >/dev/null

docker exec -i harpa-pro-pg psql -U postgres -d harpa -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE app.note_files, app.notes, app.files, app.llm_usage_events,
         app.user_limit_overrides, app.rate_limit_buckets, app.reports,
         app.project_members, app.projects, app.user_settings,
         app.waitlist_signups, public."session", public."account",
         public."verification", public."user"
  RESTART IDENTITY CASCADE;

INSERT INTO public."user"
  (id, name, email, email_verified, display_name, company_name, plan, created_at, updated_at)
VALUES
  ('usr_strscrn0001', 'Avery Chen', 'store@e2e.harpapro.com', true, 'Avery Chen', 'HARPA Field Demo', 'pro', now() - interval '12 days', now()),
  ('usr_mbranna0001', 'Maria Santos', 'maria@e2e.harpapro.com', true, 'Maria Santos', 'Northstar Builders', 'free', now() - interval '11 days', now()),
  ('usr_mbrbea0002', 'Jamal Reed', 'jamal@e2e.harpapro.com', true, 'Jamal Reed', 'Northstar Builders', 'free', now() - interval '10 days', now()),
  ('usr_mbrcyra0003', 'Nina Patel', 'nina@e2e.harpapro.com', true, 'Nina Patel', 'Northstar Builders', 'free', now() - interval '9 days', now()),
  ('usr_mbrdax0004', 'Owen Brooks', 'owen@e2e.harpapro.com', true, 'Owen Brooks', 'Northstar Builders', 'free', now() - interval '8 days', now()),
  ('usr_mbrvera0005', 'Priya Shah', 'priya@e2e.harpapro.com', true, 'Priya Shah', 'Northstar Builders', 'free', now() - interval '7 days', now());

INSERT INTO app.projects
  (id, name, client_name, address, owner_id, next_report_number, created_at, updated_at)
VALUES
  ('prj_rvrsd000001', 'Riverside Tower', 'Riverside Capital', '88 Riverfront Ave, Austin, TX', 'usr_strscrn0001', 5, now() - interval '4 days', now() - interval '1 hour'),
  ('prj_harbp000001', 'Harbor Point Retrofit', 'Portside Hotels', '212 Pier Market St, Oakland, CA', 'usr_strscrn0001', 2, now() - interval '6 days', now() - interval '5 hours'),
  ('prj_centr000001', 'Central Clinic Addition', 'CityCare Health', '1440 Grant Road, Denver, CO', 'usr_strscrn0001', 3, now() - interval '8 days', now() - interval '1 day'),
  ('prj_wstgt000001', 'Westgate Retail Shell', 'Westgate Partners', '700 Westgate Pkwy, Phoenix, AZ', 'usr_strscrn0001', 2, now() - interval '10 days', now() - interval '2 days');

INSERT INTO app.project_members (project_id, user_id, role, joined_at)
VALUES
  ('prj_rvrsd000001', 'usr_strscrn0001', 'owner', now() - interval '4 days'),
  ('prj_rvrsd000001', 'usr_mbranna0001', 'editor', now() - interval '4 days' + interval '2 hours'),
  ('prj_rvrsd000001', 'usr_mbrbea0002', 'editor', now() - interval '4 days' + interval '3 hours'),
  ('prj_rvrsd000001', 'usr_mbrcyra0003', 'viewer', now() - interval '3 days'),
  ('prj_rvrsd000001', 'usr_mbrdax0004', 'editor', now() - interval '3 days' + interval '1 hour'),
  ('prj_rvrsd000001', 'usr_mbrvera0005', 'viewer', now() - interval '2 days'),
  ('prj_harbp000001', 'usr_strscrn0001', 'owner', now() - interval '6 days'),
  ('prj_centr000001', 'usr_strscrn0001', 'owner', now() - interval '8 days'),
  ('prj_wstgt000001', 'usr_strscrn0001', 'owner', now() - interval '10 days');

INSERT INTO app.user_limit_overrides
  (user_id, report_generate, voice_transcribe, voice_summarize,
   ai_input_tokens, ai_output_tokens, reason, granted_by, granted_at)
VALUES
  ('usr_strscrn0001', 36, 240, 240, 250000, 90000,
   'Store screenshot account with realistic pro usage limits.',
   'usr_strscrn0001', now() - interval '2 days');

INSERT INTO app.reports
  (id, project_id, author_id, number, status, visit_date, body,
   notes_since_last_generation, notes_changed_at, generated_at,
   finalized_at, created_at, updated_at)
VALUES
  ('rpt_rvrsd000001', 'prj_rvrsd000001', 'usr_strscrn0001', 1, 'finalized',
   now() - interval '35 days',
   '{"meta":{"title":"Riverside Tower - Mobilization Report","summary":"Mobilization completed with erosion controls and access gates in place.","visitDate":"2026-05-10"},"weather":{"condition":"Clear","temperature":"23 C","wind":"Light south wind","impact":"No weather delays."},"workers":[{"role":"Superintendent","count":"1","hours":"8","notes":"Site orientation and access review."},{"role":"Laborers","count":"4","hours":"32","notes":"Fence and protection setup."}],"materials":[{"name":"Silt fence","quantity":"480","unit":"ft","status":"installed","condition":"Good","notes":"Installed along river frontage."}],"issues":[],"nextSteps":["Confirm crane delivery window.","Stage erosion control inspection."],"summarySections":[{"title":"Site Setup","body":"Access controls, staging, and temporary protections were established. The site is ready for excavation coordination.","attachments":{}}]}'::jsonb,
   0, NULL, now() - interval '35 days', now() - interval '34 days',
   now() - interval '35 days', now() - interval '34 days'),
  ('rpt_rvrsd000002', 'prj_rvrsd000001', 'usr_strscrn0001', 2, 'finalized',
   now() - interval '12 days',
   '{"meta":{"title":"Riverside Tower - Excavation Update","summary":"Excavation progressed on the south bay while utilities were protected at the service lane.","visitDate":"2026-06-02"},"weather":{"condition":"Hot and dry","temperature":"31 C","wind":"8 mph E","impact":"Water truck used for dust control."},"workers":[{"role":"Excavation crew","count":"6","hours":"48","notes":"South bay cut and haul-off."},{"role":"Utility spotter","count":"1","hours":"8","notes":"Observed service lane work."}],"materials":[{"name":"Crushed stone","quantity":"18","unit":"tons","status":"staged","condition":"Dry","notes":"Stored at north laydown."}],"issues":[{"title":"Utility corridor needs revised marking","severity":"medium","description":"Paint marks at the service lane have faded after haul-off traffic.","action":"Surveyor to refresh markings before the next trench shift.","attachments":{}}],"nextSteps":["Refresh utility marks.","Finish south bay proof roll."],"summarySections":[{"title":"Excavation","body":"Cut elevation was achieved in the south bay. North bay excavation remains open pending utility clearance.","attachments":{}}]}'::jsonb,
   0, NULL, now() - interval '12 days', now() - interval '11 days',
   now() - interval '12 days', now() - interval '11 days'),
  ('rpt_rvrsd000003', 'prj_rvrsd000001', 'usr_strscrn0001', 3, 'finalized',
   now() - interval '1 day',
   '{
     "meta":{
       "title":"Riverside Tower - Daily Site Report",
       "summary":"Level 4 deck prep, south foundation waterproofing, and east access scaffolding were the main focus. Work is generally on track, with three corrective items assigned before the next pour window.",
       "visitDate":"2026-06-14"
     },
     "weather":{
       "condition":"Overcast morning, clear afternoon",
       "temperature":"25 C",
       "wind":"10 mph W",
       "impact":"No stoppages. Crews covered stored cement board during the morning mist."
     },
     "workers":[
       {"role":"Superintendent","count":"1","hours":"8","notes":"Coordinated concrete, waterproofing, and facade access crews."},
       {"role":"Carpenters","count":"7","hours":"56","notes":"Set deck edge forms and checked embeds at grid D."},
       {"role":"Ironworkers","count":"5","hours":"40","notes":"Tied reinforcement at south wall and stair core."},
       {"role":"Laborers","count":"4","hours":"32","notes":"Maintained housekeeping, pump discharge lines, and traffic cones."},
       {"role":"Safety officer","count":"1","hours":"6","notes":"Completed morning access audit and scaffold tag follow-up."}
     ],
     "materials":[
       {"name":"Ready-mix concrete","quantity":"42","unit":"m3","status":"scheduled","condition":"Accepted","notes":"Supplier confirmed two trucks for the Level 4 deck pour window."},
       {"name":"Rebar mat","quantity":"1","unit":"zone","status":"installed","condition":"Needs check","notes":"South wall reinforcement complete, pending cover verification."},
       {"name":"Cement board","quantity":"24","unit":"sheets","status":"staged","condition":"Covered","notes":"Stored at the east platform under temporary wrap."},
       {"name":"Scaffold tags","quantity":"18","unit":"tags","status":"partial","condition":"Review required","notes":"Three east elevation bays need updated inspection tags."}
     ],
     "issues":[
       {
         "title":"South foundation wall shows water intrusion",
         "severity":"high",
         "description":"Damp staining and minor seepage were observed along the south foundation wall at grid D after overnight rain. Rebar cover remains visible and the waterproofing termination needs review before backfill.",
         "action":"Waterproofing subcontractor to inspect, document repair method, and complete a signed hold point before backfill.",
         "attachments":{"images":["not_prebar0001"]}
       },
       {
         "title":"Concrete truck staging could block the fire lane",
         "severity":"medium",
         "description":"The proposed truck queue overlaps the temporary fire lane near the east gate during peak delivery hours.",
         "action":"Revise delivery marshal plan and keep a 20 ft clear lane during the pour.",
         "attachments":{"images":["not_pcemnt0001"]}
       },
       {
         "title":"East scaffold bays need current inspection tags",
         "severity":"medium",
         "description":"Three scaffold access bays were in use while tags still showed the previous inspection date.",
         "action":"Safety officer to retag before morning work and brief facade crew at toolbox talk.",
         "attachments":{}
       },
       {
         "title":"Material laydown needs clearer pedestrian separation",
         "severity":"low",
         "description":"Stored sheets and hardware are orderly, but the pedestrian route at the platform pinch point needs a clearer cone line.",
         "action":"Labor crew to reset cones and add directional signage before shift change.",
         "attachments":{}
       }
     ],
     "nextSteps":[
       "Retag east scaffold bays before the next facade shift.",
       "Confirm waterproofing repair method and photo documentation.",
       "Update concrete delivery marshal plan for the fire lane.",
       "Verify south wall rebar cover before closing the hold point."
     ],
     "summarySections":[
       {
         "title":"Safety and Access",
         "body":"Morning safety walk focused on scaffold access, fire-lane clearance, and pedestrian separation around the east platform. No injuries or stop-work events were reported, but scaffold tag updates and lane control remain open before the next shift.",
         "attachments":{"images":["not_pscaf0001"]}
       },
       {
         "title":"Materials and Logistics",
         "body":"Concrete supplier confirmed the next delivery window. Cement board and hardware are staged on the platform, with temporary cover maintained after light morning mist. The laydown route needs a refreshed cone line so workers can move between the hoist and stair core without crossing storage zones.",
         "attachments":{"images":["not_pmats0001"]}
       },
       {
         "title":"Quality Control",
         "body":"Deck edge forms are aligned within tolerance and embeds were checked at grid D. The south foundation wall remains the highest-risk hold point because waterproofing repair details must be approved before backfill.",
         "attachments":{}
       }
     ]
   }'::jsonb,
   0, NULL, now() - interval '1 day' + interval '1 hour',
   now() - interval '20 hours', now() - interval '1 day',
   now() - interval '20 hours'),
  ('rpt_rvrsd000004', 'prj_rvrsd000001', 'usr_strscrn0001', 4, 'draft',
   now(),
   NULL,
   5, now() - interval '45 minutes', NULL, NULL,
   now() - interval '2 hours', now() - interval '30 minutes'),
  ('rpt_harbp000001', 'prj_harbp000001', 'usr_strscrn0001', 1, 'draft',
   now() - interval '3 days', NULL, 2, now() - interval '3 days',
   NULL, NULL, now() - interval '3 days', now() - interval '2 days'),
  ('rpt_centr000001', 'prj_centr000001', 'usr_strscrn0001', 1, 'finalized',
   now() - interval '18 days',
   '{"meta":{"title":"Central Clinic - Steel Review","summary":"Steel delivery and anchor checks completed for the addition.","visitDate":"2026-05-27"},"weather":null,"workers":[{"role":"Steel crew","count":"5","hours":"40","notes":"Set anchor templates."}],"materials":[],"issues":[],"nextSteps":["Schedule inspector walk."],"summarySections":[]}'::jsonb,
   0, NULL, now() - interval '18 days', now() - interval '17 days',
   now() - interval '18 days', now() - interval '17 days');

INSERT INTO app.files
  (id, owner_id, kind, file_key, size_bytes, content_type, project_id, report_id, created_at)
VALUES
  ('fil_cemnt000001', 'usr_strscrn0001', 'image', 'projects/prj_rvrsd000001/reports/rpt_rvrsd000003/fil_cemnt000001.jpg', 979306, 'image/jpeg', 'prj_rvrsd000001', 'rpt_rvrsd000003', now() - interval '1 day' + interval '2 hours'),
  ('fil_mats0000001', 'usr_strscrn0001', 'image', 'projects/prj_rvrsd000001/reports/rpt_rvrsd000003/fil_mats0000001.jpg', 688037, 'image/jpeg', 'prj_rvrsd000001', 'rpt_rvrsd000003', now() - interval '1 day' + interval '2 hours'),
  ('fil_rebar000001', 'usr_strscrn0001', 'image', 'projects/prj_rvrsd000001/reports/rpt_rvrsd000003/fil_rebar000001.jpg', 1010586, 'image/jpeg', 'prj_rvrsd000001', 'rpt_rvrsd000003', now() - interval '1 day' + interval '2 hours'),
  ('fil_scaf0000001', 'usr_strscrn0001', 'image', 'projects/prj_rvrsd000001/reports/rpt_rvrsd000003/fil_scaf0000001.jpg', 1072447, 'image/jpeg', 'prj_rvrsd000001', 'rpt_rvrsd000003', now() - interval '1 day' + interval '2 hours'),
  ('fil_area0000001', 'usr_strscrn0001', 'image', 'projects/prj_rvrsd000001/reports/rpt_rvrsd000003/fil_area0000001.jpg', 1020828, 'image/jpeg', 'prj_rvrsd000001', 'rpt_rvrsd000003', now() - interval '1 day' + interval '2 hours'),
  ('fil_hmse0000001', 'usr_strscrn0001', 'image', 'projects/prj_rvrsd000001/reports/rpt_rvrsd000003/fil_hmse0000001.jpg', 580871, 'image/jpeg', 'prj_rvrsd000001', 'rpt_rvrsd000003', now() - interval '1 day' + interval '2 hours');

INSERT INTO app.notes
  (id, report_id, author_id, kind, body, transcript, title, summary,
   duration_sec, language, transcribe_provider, transcribed_at, source,
   meta, created_at, updated_at)
VALUES
  ('not_prebar0001', 'rpt_rvrsd000003', 'usr_strscrn0001', 'image',
   'South foundation wall photo showing rebar and damp staining at grid D.',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'gallery',
   '{"caption":"South wall rebar and waterproofing hold point"}'::jsonb,
   now() - interval '1 day' + interval '2 hours', now() - interval '1 day' + interval '2 hours'),
  ('not_pcemnt0001', 'rpt_rvrsd000003', 'usr_mbranna0001', 'image',
   'Concrete truck staging reference near the east gate fire lane.',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'gallery',
   '{"caption":"Concrete delivery staging near east gate"}'::jsonb,
   now() - interval '1 day' + interval '2 hours 8 minutes', now() - interval '1 day' + interval '2 hours 8 minutes'),
  ('not_pscaf0001', 'rpt_rvrsd000003', 'usr_mbrbea0002', 'image',
   'Scaffold access bay photo for safety and access follow-up.',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'gallery',
   '{"caption":"East elevation scaffold bays"}'::jsonb,
   now() - interval '1 day' + interval '2 hours 15 minutes', now() - interval '1 day' + interval '2 hours 15 minutes'),
  ('not_pmats0001', 'rpt_rvrsd000003', 'usr_mbrdax0004', 'image',
   'Material platform and cement board staging for logistics section.',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'gallery',
   '{"caption":"Material staging platform"}'::jsonb,
   now() - interval '1 day' + interval '2 hours 21 minutes', now() - interval '1 day' + interval '2 hours 21 minutes'),
  ('not_parea0001', 'rpt_rvrsd000003', 'usr_strscrn0001', 'image',
   'Aerial overview of active work zones for report review.',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'gallery',
   '{"caption":"Overall site overview"}'::jsonb,
   now() - interval '1 day' + interval '2 hours 30 minutes', now() - interval '1 day' + interval '2 hours 30 minutes'),
  ('not_phmse0001', 'rpt_rvrsd000003', 'usr_mbrvera0005', 'image',
   'Residential-style construction progress reference, left unplaced for review.',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'gallery',
   '{"caption":"Exterior progress reference"}'::jsonb,
   now() - interval '1 day' + interval '2 hours 38 minutes', now() - interval '1 day' + interval '2 hours 38 minutes'),
  ('not_dtxta00001', 'rpt_rvrsd000004', 'usr_strscrn0001', 'text',
   'North stair opening protected. Crew should recheck the temporary rail after lunch because the drywall delivery will pass through this zone.',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'typed',
   '{}'::jsonb, now() - interval '90 minutes', now() - interval '90 minutes'),
  ('not_dtxtb00001', 'rpt_rvrsd000004', 'usr_mbranna0001', 'text',
   'Delivery marshal confirmed tomorrow concrete trucks will stage at the west gate instead of the fire lane.',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'typed',
   '{}'::jsonb, now() - interval '70 minutes', now() - interval '70 minutes'),
  ('not_dvcea00001', 'rpt_rvrsd000004', 'usr_mbrbea0002', 'voice',
   'Safety officer noted that the east scaffold tags were updated, but the crew still needs to move two material pallets off the walking path.',
   'Safety officer noted that the east scaffold tags were updated, but the crew still needs to move two material pallets off the walking path before the morning crew arrives.',
   'Access path follow-up',
   'Scaffold tags updated; two pallets still need to move off the walking path.',
   47, 'en', 'fixture', now() - interval '55 minutes', 'voice',
   '{"fixture":"store-screenshots"}'::jsonb, now() - interval '55 minutes', now() - interval '55 minutes');

INSERT INTO app.note_files
  (id, note_id, file_id, thumbnail_file_id, position, caption, created_at)
VALUES
  ('nfl_cemnt000001', 'not_pcemnt0001', 'fil_cemnt000001', 'fil_cemnt000001', 0, 'Concrete truck staging near east gate', now() - interval '1 day' + interval '2 hours 8 minutes'),
  ('nfl_mats0000001', 'not_pmats0001', 'fil_mats0000001', 'fil_mats0000001', 0, 'Material staging platform and covered boards', now() - interval '1 day' + interval '2 hours 21 minutes'),
  ('nfl_rebar000001', 'not_prebar0001', 'fil_rebar000001', 'fil_rebar000001', 0, 'South foundation rebar and waterproofing hold point', now() - interval '1 day' + interval '2 hours'),
  ('nfl_scaf0000001', 'not_pscaf0001', 'fil_scaf0000001', 'fil_scaf0000001', 0, 'East elevation scaffold access bays', now() - interval '1 day' + interval '2 hours 15 minutes'),
  ('nfl_area0000001', 'not_parea0001', 'fil_area0000001', 'fil_area0000001', 0, 'Overall site overview', now() - interval '1 day' + interval '2 hours 30 minutes'),
  ('nfl_hmse0000001', 'not_phmse0001', 'fil_hmse0000001', 'fil_hmse0000001', 0, 'Exterior progress reference', now() - interval '1 day' + interval '2 hours 38 minutes');

INSERT INTO app.llm_usage_events
  (id, user_id, project_id, report_id, vendor, model, operation,
   input_tokens, output_tokens, cached_tokens, input_seconds, latency_ms,
   fixture_mode, status, created_at)
VALUES
  ('lue_000000000001', 'usr_strscrn0001', 'prj_rvrsd000001', 'rpt_rvrsd000003', 'openai', 'gpt-4.1-mini', 'generate_report', 18420, 3250, 2200, NULL, 5240, 'replay', 'ok', now() - interval '1 day' + interval '30 minutes'),
  ('lue_000000000002', 'usr_strscrn0001', 'prj_rvrsd000001', 'rpt_rvrsd000004', 'openai', 'gpt-4.1-mini', 'chat', 2410, 680, 310, NULL, 1830, 'replay', 'ok', now() - interval '3 hours'),
  ('lue_000000000003', 'usr_strscrn0001', 'prj_rvrsd000001', 'rpt_rvrsd000004', 'groq', 'whisper-large-v3-turbo', 'transcribe', 0, 0, 0, 75600.000, 1280, 'replay', 'ok', now() - interval '55 minutes'),
  ('lue_000000000004', 'usr_strscrn0001', 'prj_rvrsd000001', 'rpt_rvrsd000004', 'openai', 'gpt-4.1-mini', 'chat', 1760, 520, 200, NULL, 1160, 'replay', 'ok', now() - interval '40 minutes'),
  ('lue_000000000005', 'usr_strscrn0001', 'prj_rvrsd000001', 'rpt_rvrsd000002', 'openai', 'gpt-4.1', 'generate_report', 16200, 2890, 1800, NULL, 6020, 'replay', 'ok', now() - interval '12 days' + interval '45 minutes'),
  ('lue_000000000006', 'usr_strscrn0001', 'prj_centr000001', 'rpt_centr000001', 'openai', 'gpt-4.1-nano', 'generate_report', 14100, 2440, 0, NULL, 7150, 'replay', 'ok', now() - interval '18 days' + interval '30 minutes'),
  ('lue_000000000007', 'usr_strscrn0001', 'prj_harbp000001', 'rpt_harbp000001', 'openai', 'gpt-4.1-nano', 'chat', 3320, 980, 440, NULL, 2380, 'replay', 'ok', now() - interval '22 days'),
  ('lue_000000000008', 'usr_strscrn0001', 'prj_rvrsd000001', 'rpt_rvrsd000001', 'openai', 'gpt-4.1-mini', 'generate_report', 12900, 2110, 1250, NULL, 4930, 'replay', 'ok', now() - interval '35 days'),
  ('lue_000000000009', 'usr_strscrn0001', 'prj_harbp000001', 'rpt_harbp000001', 'openai', 'gpt-4.1-mini', 'chat', 2200, 510, 0, NULL, 2140, 'replay', 'error', now() - interval '2 hours'),
  ('lue_000000000010', 'usr_strscrn0001', 'prj_rvrsd000001', 'rpt_rvrsd000003', 'groq', 'whisper-large-v3-turbo', 'transcribe', 0, 0, 0, 80100.000, 1510, 'replay', 'ok', now() - interval '1 day' + interval '1 hour'),
  ('lue_000000000011', 'usr_strscrn0001', 'prj_rvrsd000001', 'rpt_rvrsd000003', 'openai', 'gpt-4.1', 'chat', 3890, 1020, 700, NULL, 1940, 'replay', 'ok', now() - interval '1 day' + interval '2 hours'),
  ('lue_000000000012', 'usr_strscrn0001', 'prj_wstgt000001', NULL, 'openai', 'gpt-4.1-nano', 'chat', 1180, 340, 0, NULL, 1430, 'replay', 'ok', now() - interval '45 days');

SELECT
  (SELECT count(*) FROM app.projects) AS projects,
  (SELECT count(*) FROM app.reports WHERE project_id = 'prj_rvrsd000001') AS riverside_reports,
  (SELECT count(*) FROM app.project_members WHERE project_id = 'prj_rvrsd000001') AS riverside_members,
  (SELECT count(*) FROM app.note_files) AS photo_files,
  (SELECT count(*) FROM app.llm_usage_events) AS usage_events;
SQL

docker exec harpa-pro-minio sh -c "rm -rf /data/store-screenshot-fixtures && mkdir -p /data/store-screenshot-fixtures"

copy_fixture() {
  local file="$1"
  docker cp "$FIXTURE_DIR/$file" "harpa-pro-minio:/data/store-screenshot-fixtures/$file"
}

copy_fixture "store-construction-cement-mixer.jpg"
copy_fixture "store-construction-materials-platform.jpg"
copy_fixture "store-construction-rebar-foundation.jpg"
copy_fixture "store-construction-scaffolding.jpg"
copy_fixture "store-construction-overhead.jpg"
copy_fixture "store-construction-homes.jpg"

docker run --rm --network container:harpa-pro-minio --volumes-from harpa-pro-minio --entrypoint /bin/sh minio/mc:latest -c '
set -eu
mc alias set local http://localhost:9000 minio minio-dev-secret >/dev/null
mc mb -p local/harpa-pro >/dev/null 2>&1 || true
mc cp /data/store-screenshot-fixtures/store-construction-cement-mixer.jpg local/harpa-pro/projects/prj_rvrsd000001/reports/rpt_rvrsd000003/fil_cemnt000001.jpg >/dev/null
mc cp /data/store-screenshot-fixtures/store-construction-materials-platform.jpg local/harpa-pro/projects/prj_rvrsd000001/reports/rpt_rvrsd000003/fil_mats0000001.jpg >/dev/null
mc cp /data/store-screenshot-fixtures/store-construction-rebar-foundation.jpg local/harpa-pro/projects/prj_rvrsd000001/reports/rpt_rvrsd000003/fil_rebar000001.jpg >/dev/null
mc cp /data/store-screenshot-fixtures/store-construction-scaffolding.jpg local/harpa-pro/projects/prj_rvrsd000001/reports/rpt_rvrsd000003/fil_scaf0000001.jpg >/dev/null
mc cp /data/store-screenshot-fixtures/store-construction-overhead.jpg local/harpa-pro/projects/prj_rvrsd000001/reports/rpt_rvrsd000003/fil_area0000001.jpg >/dev/null
mc cp /data/store-screenshot-fixtures/store-construction-homes.jpg local/harpa-pro/projects/prj_rvrsd000001/reports/rpt_rvrsd000003/fil_hmse0000001.jpg >/dev/null
'

docker exec harpa-pro-minio sh -c "rm -rf /data/store-screenshot-fixtures"

echo "Seeded store screenshot data for store@e2e.harpapro.com."
