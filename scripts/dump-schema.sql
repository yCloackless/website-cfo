CREATE TABLE IF NOT EXISTS "public"."_migrations" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "applied_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."account_creation_keys" (
    "id" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "created_by_user_id" "text" NOT NULL,
    "used_by_user_id" "text",
    "created_at" "text" NOT NULL,
    "used_at" "text",
    "expires_at" "text"
);

CREATE TABLE IF NOT EXISTS "public"."activation_tokens" (
    "id" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "customer_email" "text" NOT NULL,
    "is_used" boolean DEFAULT false NOT NULL,
    "used_at" "text",
    "used_by_user_id" "text",
    "expires_at" "text" NOT NULL,
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."admin_recovery_codes" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "is_used" boolean DEFAULT false NOT NULL,
    "used_at" "text",
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."anki_cards" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "note_id" "text" NOT NULL,
    "deck_id" "text" NOT NULL,
    "template_ord" integer DEFAULT 0 NOT NULL,
    "queue" integer DEFAULT 0 NOT NULL,
    "card_type" integer DEFAULT 0 NOT NULL,
    "due" integer DEFAULT 0 NOT NULL,
    "interval_days" integer DEFAULT 0 NOT NULL,
    "ease_factor" real DEFAULT 2.5 NOT NULL,
    "reps" integer DEFAULT 0 NOT NULL,
    "lapses" integer DEFAULT 0 NOT NULL,
    "difficulty" real DEFAULT 0.0 NOT NULL,
    "stability" real DEFAULT 0.0 NOT NULL,
    "last_review_at" "text",
    "flags" integer DEFAULT 0 NOT NULL,
    "is_marked" integer DEFAULT 0 NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."anki_deck_configs" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "config_json" "text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."anki_decks" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "config_id" "text",
    "is_collapsed" integer DEFAULT 0 NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    "parent_deck_id" "text"
);

CREATE TABLE IF NOT EXISTS "public"."anki_fields" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "notetype_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "ordinal" integer NOT NULL,
    "font_size" integer DEFAULT 20,
    "font_name" "text" DEFAULT 'Arial'::"text",
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."anki_media" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "hash" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "storage_path" "text" NOT NULL,
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."anki_notes" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "notetype_id" "text" NOT NULL,
    "guid" "text" NOT NULL,
    "fields_json" "text" NOT NULL,
    "tags" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    "importance" "text" DEFAULT 'normal'::"text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."anki_notetypes" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'standard'::"text" NOT NULL,
    "css" "text" NOT NULL,
    "is_system" integer DEFAULT 0 NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "anki_notetypes_kind_check" CHECK (("kind" = ANY (ARRAY['standard'::"text", 'cloze'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."anki_revlog" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "card_id" "text" NOT NULL,
    "rating" integer NOT NULL,
    "reviewed_at" "text" NOT NULL,
    "elapsed_time_ms" integer DEFAULT 0 NOT NULL,
    "previous_interval" integer NOT NULL,
    "new_interval" integer NOT NULL,
    "previous_state" "text" NOT NULL,
    "review_type" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "anki_revlog_rating_check" CHECK (("rating" = ANY (ARRAY[1, 2, 3, 4])))
);

CREATE TABLE IF NOT EXISTS "public"."anki_templates" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "notetype_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "ordinal" integer NOT NULL,
    "qfmt" "text" NOT NULL,
    "afmt" "text" NOT NULL,
    "bqfmt" "text",
    "bafmt" "text",
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."audit_events" (
    "id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "actor" "text" NOT NULL,
    "resource" "text" NOT NULL,
    "status" "text" NOT NULL,
    "ip" "text",
    "details_json" "text",
    "created_at" "text" NOT NULL,
    "user_id" "text",
    "user_agent" "text",
    "actor_user_id" "text",
    "target_type" "text",
    "target_id" "text",
    CONSTRAINT "audit_events_status_check" CHECK (("status" = ANY (ARRAY['SUCCESS'::"text", 'FAILED'::"text", 'WARNING'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."board_intelligence_exams" (
    "id" "text" NOT NULL,
    "profile_id" "text" NOT NULL,
    "exam_paper_id" "text" NOT NULL,
    "status" "text" DEFAULT 'UPLOADED'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "exam_year" integer NOT NULL,
    "board" "text",
    "role_name" "text",
    "phase" "text",
    "discipline" "text",
    "exam_type" "text",
    "official_answer_key_json" "text",
    "notes" "text",
    "approved_by_user_id" "text",
    "approved_at" "text",
    "rejected_by_user_id" "text",
    "rejected_at" "text",
    "created_by_user_id" "text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "board_intelligence_exams_status_check" CHECK (("status" = ANY (ARRAY['UPLOADED'::"text", 'PROCESSING'::"text", 'EXTRACTED'::"text", 'REVIEW_REQUIRED'::"text", 'APPROVED'::"text", 'REJECTED'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."board_intelligence_jobs" (
    "id" "text" NOT NULL,
    "profile_id" "text" NOT NULL,
    "job_type" "text" NOT NULL,
    "status" "text" DEFAULT 'QUEUED'::"text" NOT NULL,
    "progress" integer DEFAULT 0 NOT NULL,
    "total_items" integer DEFAULT 0 NOT NULL,
    "idempotency_key" "text",
    "checkpoint_json" "text",
    "result_summary_json" "text",
    "error_message" "text",
    "created_by_user_id" "text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "board_intelligence_jobs_job_type_check" CHECK (("job_type" = ANY (ARRAY['IMPORT'::"text", 'ANALYZE'::"text", 'AGGREGATE'::"text", 'GENERATE_PROFILE'::"text", 'REBUILD'::"text"]))),
    CONSTRAINT "board_intelligence_jobs_progress_check" CHECK (("progress" >= 0)),
    CONSTRAINT "board_intelligence_jobs_status_check" CHECK (("status" = ANY (ARRAY['QUEUED'::"text", 'EXTRACTING'::"text", 'CLASSIFYING'::"text", 'ANALYZING'::"text", 'AGGREGATING'::"text", 'GENERATING_PROFILE'::"text", 'REVIEW_REQUIRED'::"text", 'COMPLETED'::"text", 'FAILED'::"text"]))),
    CONSTRAINT "board_intelligence_jobs_total_items_check" CHECK (("total_items" >= 0))
);

CREATE TABLE IF NOT EXISTS "public"."board_intelligence_profiles" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "institution" "text" NOT NULL,
    "board" "text" NOT NULL,
    "contest" "text",
    "role_name" "text",
    "period_start" integer,
    "period_end" integer,
    "description" "text",
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "active_version" integer DEFAULT 0 NOT NULL,
    "exam_count" integer DEFAULT 0 NOT NULL,
    "question_count" integer DEFAULT 0 NOT NULL,
    "created_by_user_id" "text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "board_intelligence_profiles_exam_count_check" CHECK (("exam_count" >= 0)),
    CONSTRAINT "board_intelligence_profiles_question_count_check" CHECK (("question_count" >= 0)),
    CONSTRAINT "board_intelligence_profiles_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'ACTIVE'::"text", 'ARCHIVED'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."board_profile_snapshots" (
    "id" "text" NOT NULL,
    "profile_id" "text" NOT NULL,
    "source_exam_ids_json" "text" NOT NULL,
    "source_question_ids_json" "text" NOT NULL,
    "source_analysis_ids_json" "text" NOT NULL,
    "stats_json" "text" NOT NULL,
    "algorithm_version" "text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "model_version" "text" NOT NULL,
    "created_by_user_id" "text" NOT NULL,
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."board_profile_versions" (
    "id" "text" NOT NULL,
    "profile_id" "text" NOT NULL,
    "version" integer NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "snapshot_id" "text" NOT NULL,
    "profile_json" "text" NOT NULL,
    "change_summary_json" "text" NOT NULL,
    "style_summary" "text" NOT NULL,
    "confidence" real NOT NULL,
    "generated_by_user_id" "text" NOT NULL,
    "published_by_user_id" "text",
    "published_at" "text",
    "restored_from_version_id" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "board_profile_versions_confidence_check" CHECK ((("confidence" >= (0)::double precision) AND ("confidence" <= (1)::double precision))),
    CONSTRAINT "board_profile_versions_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'ACTIVE'::"text", 'DISCARDED'::"text", 'SUPERSEDED'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."board_question_analysis" (
    "id" "text" NOT NULL,
    "profile_id" "text" NOT NULL,
    "exam_id" "text" NOT NULL,
    "question_id" "text" NOT NULL,
    "question_hash" "text" NOT NULL,
    "prompt_version" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "model_version" "text" NOT NULL,
    "taxonomy_json" "text" NOT NULL,
    "metrics_json" "text" NOT NULL,
    "confidence" real NOT NULL,
    "status" "text" DEFAULT 'READY'::"text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "board_question_analysis_confidence_check" CHECK ((("confidence" >= (0)::double precision) AND ("confidence" <= (1)::double precision))),
    CONSTRAINT "board_question_analysis_status_check" CHECK (("status" = ANY (ARRAY['READY'::"text", 'LOW_CONFIDENCE'::"text", 'FAILED'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."cadet_session_locks" (
    "user_id" "text" NOT NULL,
    "active_session_id" "text",
    "locked_until" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."cadet_temporary_source_blocks" (
    "id" "text" NOT NULL,
    "ip" "text" NOT NULL,
    "user_id" "text",
    "reason" "text" NOT NULL,
    "locked_until" "text" NOT NULL,
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."consent_records" (
    "id" "text" NOT NULL,
    "user_id" "text",
    "category" "text" NOT NULL,
    "policy_version" "text" NOT NULL,
    "terms_version" "text",
    "status" "text" DEFAULT 'granted'::"text" NOT NULL,
    "ip_hash" "text",
    "user_agent" "text",
    "granted_at" "text" NOT NULL,
    "revoked_at" "text",
    CONSTRAINT "consent_records_category_check" CHECK (("category" = ANY (ARRAY['necessary'::"text", 'analytics'::"text", 'marketing'::"text", 'preferences'::"text", 'ai_processing'::"text", 'terms_of_use'::"text"]))),
    CONSTRAINT "consent_records_status_check" CHECK (("status" = ANY (ARRAY['granted'::"text", 'revoked'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."entitlements" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "granted_at" "text" NOT NULL,
    "expires_at" "text",
    "revoked_at" "text",
    CONSTRAINT "entitlements_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text", 'expired'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."exam_jobs" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "exam_id" "text",
    "job_type" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "progress" integer DEFAULT 0 NOT NULL,
    "total_items" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "idempotency_key" "text",
    "result_summary_json" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    "payload_json" "text",
    CONSTRAINT "exam_jobs_job_type_check" CHECK (("job_type" = ANY (ARRAY['EXTRACTION'::"text", 'AI_SOLVE'::"text"]))),
    CONSTRAINT "exam_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'reviewing'::"text", 'completed'::"text", 'failed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."exam_papers" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "institution" "text" NOT NULL,
    "exam_year" integer NOT NULL,
    "file_id" "text",
    "total_questions" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'READY'::"text" NOT NULL,
    "primary_disciplines_json" "text",
    "metadata_json" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    "publication_status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    CONSTRAINT "exam_papers_publication_status_check" CHECK (("publication_status" = ANY (ARRAY['DRAFT'::"text", 'IN_REVIEW'::"text", 'PUBLISHED'::"text", 'REJECTED'::"text"]))),
    CONSTRAINT "exam_papers_status_check" CHECK (("status" = ANY (ARRAY['QUEUED'::"text", 'PROCESSING'::"text", 'READY'::"text", 'ERROR'::"text", 'NEEDS_REVIEW'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."exam_questions" (
    "id" "text" NOT NULL,
    "exam_id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "question_number" integer NOT NULL,
    "statement" "text" NOT NULL,
    "support_text" "text",
    "options_json" "text" NOT NULL,
    "correct_option" "text",
    "discipline" "text" NOT NULL,
    "topic" "text" NOT NULL,
    "subtopic" "text" NOT NULL,
    "difficulty" "text" DEFAULT 'MÃ©dio'::"text" NOT NULL,
    "difficulty_score" real DEFAULT 0.5 NOT NULL,
    "confidence_score" real DEFAULT 0.95 NOT NULL,
    "images_json" "text",
    "ai_solution_json" "text",
    "status" "text" DEFAULT 'READY'::"text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    "review_status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    CONSTRAINT "exam_questions_correct_option_check" CHECK ((("correct_option" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text", 'D'::"text", 'E'::"text"])) OR ("correct_option" IS NULL))),
    CONSTRAINT "exam_questions_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['FÃ¡cil'::"text", 'MÃ©dio'::"text", 'DifÃ­cil'::"text"]))),
    CONSTRAINT "exam_questions_review_status_check" CHECK (("review_status" = ANY (ARRAY['PENDING'::"text", 'APPROVED'::"text", 'REJECTED'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."flashcard_decks" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "subject_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."flashcard_reviews" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "flashcard_id" "text" NOT NULL,
    "rating" integer NOT NULL,
    "reviewed_at" "text" NOT NULL,
    "previous_interval" integer NOT NULL,
    "new_interval" integer NOT NULL,
    "previous_ease_factor" real NOT NULL,
    "new_ease_factor" real NOT NULL,
    CONSTRAINT "flashcard_reviews_rating_check" CHECK (("rating" = ANY (ARRAY[1, 2, 3, 4])))
);

CREATE TABLE IF NOT EXISTS "public"."flashcard_subjects" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon" "text",
    "color" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."flashcards" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "subject_id" "text" NOT NULL,
    "deck_id" "text" NOT NULL,
    "front" "text" NOT NULL,
    "back" "text" NOT NULL,
    "front_image" "text",
    "back_image" "text",
    "last_reviewed_at" "text",
    "next_review_at" "text" NOT NULL,
    "interval_days" integer DEFAULT 0 NOT NULL,
    "ease_factor" real DEFAULT 2.5 NOT NULL,
    "review_count" integer DEFAULT 0 NOT NULL,
    "lapses" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    "importance" "text" DEFAULT 'normal'::"text" NOT NULL,
    CONSTRAINT "flashcards_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'learning'::"text", 'review'::"text", 'mastered'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "text" NOT NULL,
    "public_order_id" "text" NOT NULL,
    "user_id" "text",
    "customer_email" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "amount" integer NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "payment_provider" "text" NOT NULL,
    "external_payment_id" "text",
    "payment_method" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" "text" NOT NULL,
    "paid_at" "text",
    "updated_at" "text" NOT NULL,
    CONSTRAINT "orders_amount_check" CHECK (("amount" >= 0)),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'cancelled'::"text", 'refunded'::"text", 'partially_refunded'::"text", 'charged_back'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."password_resets" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "expires_at" "text" NOT NULL,
    "is_used" boolean DEFAULT false NOT NULL,
    "used_at" "text",
    "created_at" "text" NOT NULL,
    "failed_attempts" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "external_payment_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "amount" integer NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "raw_payload_json" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "payments_amount_check" CHECK (("amount" >= 0))
);

CREATE TABLE IF NOT EXISTS "public"."privacy_requests" (
    "id" "text" NOT NULL,
    "request_code" "text" NOT NULL,
    "user_id" "text",
    "email" "text" NOT NULL,
    "request_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "details" "text",
    "admin_notes" "text",
    "processed_by_user_id" "text",
    "created_at" "text" NOT NULL,
    "processed_at" "text",
    "updated_at" "text" NOT NULL,
    CONSTRAINT "privacy_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['access'::"text", 'rectification'::"text", 'deletion'::"text", 'export'::"text", 'information'::"text", 'revocation'::"text"]))),
    CONSTRAINT "privacy_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'under_review'::"text", 'completed'::"text", 'rejected'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "text" NOT NULL,
    "sku" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "amount" integer NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "features_json" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "products_amount_check" CHECK (("amount" >= 0))
);

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "target_exam" "text",
    "bio" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    "avatar_url" "text"
);

CREATE TABLE IF NOT EXISTS "public"."question_assets" (
    "id" "text" NOT NULL,
    "question_id" "text" NOT NULL,
    "segment_id" "text",
    "asset_type" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "public_url" "text",
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "format" "text" DEFAULT 'webp'::"text" NOT NULL,
    "dpi" integer DEFAULT 180 NOT NULL,
    "created_at" "text" NOT NULL,
    CONSTRAINT "question_assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['original_crop'::"text", 'thumbnail'::"text", 'support_crop'::"text"]))),
    CONSTRAINT "question_assets_height_check" CHECK (("height" > 0)),
    CONSTRAINT "question_assets_width_check" CHECK (("width" > 0))
);

CREATE TABLE IF NOT EXISTS "public"."question_audit_logs" (
    "id" "text" NOT NULL,
    "question_id" "text" NOT NULL,
    "detector" "text" NOT NULL,
    "confidence" real NOT NULL,
    "is_manual_review" boolean DEFAULT false NOT NULL,
    "user_id" "text",
    "previous_bbox_json" "text",
    "new_bbox_json" "text",
    "notes" "text",
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."question_segments" (
    "id" "text" NOT NULL,
    "question_id" "text" NOT NULL,
    "exam_id" "text" NOT NULL,
    "page" integer NOT NULL,
    "x" real NOT NULL,
    "y" real NOT NULL,
    "width" real NOT NULL,
    "height" real NOT NULL,
    "order_num" integer DEFAULT 1 NOT NULL,
    "confidence" real DEFAULT 1.0 NOT NULL,
    "source" "text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "question_segments_confidence_check" CHECK ((("confidence" >= (0)::double precision) AND ("confidence" <= (1)::double precision))),
    CONSTRAINT "question_segments_height_check" CHECK (("height" > (0)::double precision)),
    CONSTRAINT "question_segments_page_check" CHECK (("page" >= 1)),
    CONSTRAINT "question_segments_source_check" CHECK (("source" = ANY (ARRAY['pdf_text'::"text", 'ocr'::"text", 'layout'::"text", 'ai_fallback'::"text", 'manual'::"text"]))),
    CONSTRAINT "question_segments_width_check" CHECK (("width" > (0)::double precision)),
    CONSTRAINT "question_segments_x_check" CHECK (("x" >= (0)::double precision)),
    CONSTRAINT "question_segments_y_check" CHECK (("y" >= (0)::double precision))
);

CREATE TABLE IF NOT EXISTS "public"."refund_requests" (
    "id" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "user_id" "text",
    "reason" "text" NOT NULL,
    "amount" integer NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "admin_notes" "text",
    "reviewed_by_admin_id" "text",
    "reviewed_at" "text",
    "processed_at" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "refund_requests_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "refund_requests_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'under_review'::"text", 'approved_by_admin'::"text", 'rejected'::"text", 'processing'::"text", 'refunded'::"text", 'failed'::"text", 'cancelled'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."security_deception_events" (
    "id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "honeypot_id" "text" NOT NULL,
    "request_path" "text" NOT NULL,
    "method" "text" NOT NULL,
    "risk_score" integer NOT NULL,
    "user_id" "text",
    "ip_hash" "text",
    "user_agent_summary" "text",
    "action_taken" "text" NOT NULL,
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."security_notifications" (
    "id" "text" NOT NULL,
    "user_id" "text",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "read_at" "text",
    "metadata_json" "text",
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "role" "text" NOT NULL,
    "ip" "text",
    "user_agent" "text",
    "expires_at" "text" NOT NULL,
    "revoked_at" "text",
    "created_at" "text" NOT NULL,
    "impersonated_by_user_id" "text",
    "parent_session_id" "text",
    CONSTRAINT "sessions_role_check" CHECK (("role" = ANY (ARRAY['cadet'::"text", 'admin'::"text", 'support'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."student_academic_periods" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "starts_at" "text",
    "ends_at" "text",
    "active" integer DEFAULT 1 NOT NULL,
    "created_at" "text" NOT NULL,
    CONSTRAINT "student_academic_periods_active_check" CHECK (("active" = ANY (ARRAY[0, 1])))
);

CREATE TABLE IF NOT EXISTS "public"."student_ai_analyses" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "analysis_type" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "structured_json" "text",
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."student_ai_usage" (
    "user_id" "text" NOT NULL,
    "usage_date" "text" NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    "report_count" integer DEFAULT 0 NOT NULL,
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."student_calendar_events" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "event_date" "text" NOT NULL,
    "start_time" "text",
    "end_time" "text",
    "exam_id" "text",
    "notes" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "student_calendar_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['exam'::"text", 'assignment'::"text", 'vestibular'::"text", 'academic'::"text", 'custom'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."student_exams" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "subject_id" "text",
    "name" "text" NOT NULL,
    "exam_date" "text" NOT NULL,
    "exam_time" "text",
    "weight" real DEFAULT 1 NOT NULL,
    "target_grade" real,
    "topics_json" "text" DEFAULT '[]'::"text" NOT NULL,
    "notes" "text",
    "room" "text",
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "student_exams_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "student_exams_target_grade_check" CHECK ((("target_grade" IS NULL) OR (("target_grade" >= (0)::double precision) AND ("target_grade" <= (10)::double precision)))),
    CONSTRAINT "student_exams_weight_check" CHECK (("weight" > (0)::double precision))
);

CREATE TABLE IF NOT EXISTS "public"."student_flashcard_state" (
    "user_id" "text" NOT NULL,
    "decks_json" "text" DEFAULT '[]'::"text" NOT NULL,
    "cards_json" "text" DEFAULT '[]'::"text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."student_goal_institutions" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "goal_id" "text" NOT NULL,
    "institution_name" "text" NOT NULL,
    "institution_code" "text",
    "state" "text",
    "city" "text"
);

CREATE TABLE IF NOT EXISTS "public"."student_goals" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "degree" "text" NOT NULL,
    "selection_system" "text" DEFAULT 'ENEM'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "student_goals_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."student_grades" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "subject_id" "text" NOT NULL,
    "period_id" "text",
    "assessment_name" "text" NOT NULL,
    "score" real NOT NULL,
    "weight" real DEFAULT 1 NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "is_uncertain" integer DEFAULT 0 NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "student_grades_is_uncertain_check" CHECK (("is_uncertain" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "student_grades_score_check" CHECK ((("score" >= (0)::double precision) AND ("score" <= (10)::double precision))),
    CONSTRAINT "student_grades_weight_check" CHECK (("weight" > (0)::double precision))
);

CREATE TABLE IF NOT EXISTS "public"."student_knowledge_profiles" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "discipline" "text" NOT NULL,
    "topic" "text" NOT NULL,
    "subtopic" "text" NOT NULL,
    "mastery_score" real DEFAULT 0 NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "correct_attempts" integer DEFAULT 0 NOT NULL,
    "average_response_seconds" real,
    "average_confidence" real,
    "consistency_score" real DEFAULT 0 NOT NULL,
    "last_attempt_at" "text",
    "updated_at" "text" NOT NULL,
    CONSTRAINT "student_knowledge_profiles_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "student_knowledge_profiles_consistency_score_check" CHECK ((("consistency_score" >= (0)::double precision) AND ("consistency_score" <= (100)::double precision))),
    CONSTRAINT "student_knowledge_profiles_correct_attempts_check" CHECK (("correct_attempts" >= 0)),
    CONSTRAINT "student_knowledge_profiles_mastery_score_check" CHECK ((("mastery_score" >= (0)::double precision) AND ("mastery_score" <= (100)::double precision)))
);

CREATE TABLE IF NOT EXISTS "public"."student_profiles" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "institution" "text" DEFAULT 'IFRJ'::"text" NOT NULL,
    "campus" "text",
    "course" "text",
    "school_year" "text",
    "class_name" "text",
    "shift" "text",
    "available_time_json" "text",
    "onboarding_completed" integer DEFAULT 0 NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "student_profiles_onboarding_completed_check" CHECK (("onboarding_completed" = ANY (ARRAY[0, 1])))
);

CREATE TABLE IF NOT EXISTS "public"."student_question_attempts" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "question_id" "text" NOT NULL,
    "exam_id" "text" NOT NULL,
    "discipline" "text" NOT NULL,
    "topic" "text" NOT NULL,
    "subtopic" "text" NOT NULL,
    "selected_option" "text",
    "is_correct" boolean NOT NULL,
    "response_seconds" integer,
    "confidence_score" real,
    "error_type" "text",
    "created_at" "text" NOT NULL,
    "simulation_id" "text",
    CONSTRAINT "student_question_attempts_confidence_score_check" CHECK ((("confidence_score" IS NULL) OR (("confidence_score" >= (0)::double precision) AND ("confidence_score" <= (1)::double precision)))),
    CONSTRAINT "student_question_attempts_response_seconds_check" CHECK ((("response_seconds" IS NULL) OR ("response_seconds" >= 0)))
);

CREATE TABLE IF NOT EXISTS "public"."student_recommendations" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "subject_id" "text",
    "title" "text" NOT NULL,
    "minutes" integer NOT NULL,
    "topic" "text",
    "recommendation_date" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "completed" integer DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'priority_engine'::"text" NOT NULL,
    "created_at" "text" NOT NULL,
    CONSTRAINT "student_recommendations_completed_check" CHECK (("completed" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "student_recommendations_minutes_check" CHECK (("minutes" > 0)),
    CONSTRAINT "student_recommendations_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."student_report_cards" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "file_id" "text" NOT NULL,
    "period_id" "text",
    "status" "text" DEFAULT 'uploaded'::"text" NOT NULL,
    "extracted_json" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "student_report_cards_status_check" CHECK (("status" = ANY (ARRAY['uploaded'::"text", 'processing'::"text", 'ready'::"text", 'needs_review'::"text", 'failed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."student_revisions" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "question_id" "text",
    "discipline" "text" NOT NULL,
    "topic" "text" NOT NULL,
    "subtopic" "text" NOT NULL,
    "due_at" "text" NOT NULL,
    "interval_days" integer NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "source" "text" DEFAULT 'PERFORMANCE'::"text" NOT NULL,
    "completed_at" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "student_revisions_interval_days_check" CHECK (("interval_days" > 0)),
    CONSTRAINT "student_revisions_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'COMPLETED'::"text", 'SKIPPED'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."student_simulations" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "mode" "text" NOT NULL,
    "status" "text" DEFAULT 'CREATED'::"text" NOT NULL,
    "question_ids_json" "text" NOT NULL,
    "started_at" "text",
    "completed_at" "text",
    "created_at" "text" NOT NULL,
    CONSTRAINT "student_simulations_mode_check" CHECK (("mode" = ANY (ARRAY['TRADITIONAL'::"text", 'ADAPTIVE'::"text"]))),
    CONSTRAINT "student_simulations_status_check" CHECK (("status" = ANY (ARRAY['CREATED'::"text", 'IN_PROGRESS'::"text", 'COMPLETED'::"text", 'ABANDONED'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."student_subject_topics" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "subject_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."student_subjects" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'escola'::"text" NOT NULL,
    "source" "text" DEFAULT 'custom'::"text" NOT NULL,
    "active" integer DEFAULT 1 NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "student_subjects_active_check" CHECK (("active" = ANY (ARRAY[0, 1])))
);

CREATE TABLE IF NOT EXISTS "public"."study_sessions" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "subject_id" "text" NOT NULL,
    "subject_name" "text" NOT NULL,
    "topic" "text",
    "date_str" "text" NOT NULL,
    "duration_seconds" integer NOT NULL,
    "started_at" "text",
    "ended_at" "text" NOT NULL,
    "notes" "text",
    "created_at" "text" NOT NULL,
    "source" "text",
    "local_session_id" "text",
    CONSTRAINT "study_sessions_duration_seconds_check" CHECK (("duration_seconds" > 0))
);

CREATE TABLE IF NOT EXISTS "public"."support_materials" (
    "id" "text" NOT NULL,
    "exam_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content_text" "text",
    "page" integer NOT NULL,
    "bbox_json" "text",
    "asset_path" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "support_materials_page_check" CHECK (("page" >= 1))
);

CREATE TABLE IF NOT EXISTS "public"."system_integrations" (
    "id" "text" NOT NULL,
    "encrypted_payload" "text" NOT NULL,
    "updated_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."university_courses" (
    "id" "text" NOT NULL,
    "institution_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "degree_type" "text",
    "modality" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "mec_code" "text"
);

CREATE TABLE IF NOT EXISTS "public"."university_institutions" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "acronym" "text",
    "mec_code" "text",
    "state" "text",
    "city" "text",
    "institution_type" "text",
    "administrative_category" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."uploaded_files" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "extension" "text" NOT NULL,
    "size_bytes" integer NOT NULL,
    "sha256" "text" NOT NULL,
    "status" "text" DEFAULT 'QUARANTINED'::"text" NOT NULL,
    "scan_details_json" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    CONSTRAINT "uploaded_files_size_bytes_check" CHECK (("size_bytes" > 0)),
    CONSTRAINT "uploaded_files_status_check" CHECK (("status" = ANY (ARRAY['UPLOADED'::"text", 'QUARANTINED'::"text", 'SCANNING'::"text", 'CLEAN'::"text", 'REJECTED'::"text", 'PROCESSING'::"text", 'READY'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."user_state_snapshots" (
    "user_id" "text" NOT NULL,
    "payload_json" "text" NOT NULL,
    "schema_version" integer DEFAULT 1 NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "text" NOT NULL,
    "email" "text" NOT NULL,
    "username" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL,
    "can_access_notion" boolean DEFAULT false NOT NULL,
    "can_access_ifrj" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "users_can_access_ifrj_check" CHECK (("can_access_ifrj" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['cadet'::"text", 'admin'::"text", 'support'::"text"]))),
    CONSTRAINT "users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'pending_activation'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."whiteboard_assets" (
    "id" "text" NOT NULL,
    "whiteboard_id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "filename" "text" NOT NULL,
    "storage_key" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "width" integer,
    "height" integer,
    "created_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."whiteboard_documents" (
    "whiteboard_id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "document_state" "text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" "text" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."whiteboards" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "background_type" "text" DEFAULT 'black'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" "text" NOT NULL,
    "updated_at" "text" NOT NULL
);