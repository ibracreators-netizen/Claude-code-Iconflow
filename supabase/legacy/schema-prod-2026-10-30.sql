-- Schéma Supabase Iconflow Studio (projet xqacgjtlktzrmfcolbst)
-- Extrait le 2026-10-30 en lecture seule : structure uniquement, AUCUNE donnée.
-- 14 tables, contraintes, policies RLS. Les mots de passe/hash ne figurent pas ici.

-- ===== agency_client_management =====
CREATE TABLE public.agency_client_management (
  client_id uuid NOT NULL,
  stage text DEFAULT 'onboarding'::text NOT NULL,
  notes text DEFAULT ''::text NOT NULL,
  revision bigint DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid DEFAULT auth.uid() NOT NULL,
  PRIMARY KEY (client_id)
);

ALTER TABLE public.agency_client_management ADD CONSTRAINT agency_client_management_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id);
ALTER TABLE public.agency_client_management ENABLE ROW LEVEL SECURITY;
-- POLICY agency_management_insert (INSERT, roles: authenticated)
CREATE POLICY agency_management_insert ON public.agency_client_management FOR INSERT TO authenticated WITH CHECK (((( SELECT my_role() AS my_role) = 'agency'::text) AND (EXISTS ( SELECT 1
 FROM clients c
 WHERE ((c.id = agency_client_management.client_id) AND (c.status IS DISTINCT FROM 'archived'::text)))) AND (updated_by = ( SELECT auth.uid() AS uid))));
-- POLICY agency_management_read (SELECT, roles: authenticated)
CREATE POLICY agency_management_read ON public.agency_client_management FOR SELECT TO authenticated USING (((( SELECT my_role() AS my_role) = 'agency'::text) AND (EXISTS ( SELECT 1
 FROM clients c
 WHERE (c.id = agency_client_management.client_id)))));
-- POLICY agency_management_update (UPDATE, roles: authenticated)
CREATE POLICY agency_management_update ON public.agency_client_management FOR UPDATE TO authenticated USING (((( SELECT my_role() AS my_role) = 'agency'::text) AND (EXISTS ( SELECT 1
 FROM clients c
 WHERE ((c.id = agency_client_management.client_id) AND (c.status IS DISTINCT FROM 'archived'::text)))))) WITH CHECK (((( SELECT my_role() AS my_role) = 'agency'::text) AND (EXISTS ( SELECT 1
 FROM clients c
 WHERE ((c.id = agency_client_management.client_id) AND (c.status IS DISTINCT FROM 'archived'::text)))) AND (updated_by = ( SELECT auth.uid() AS uid))));

-- ===== angles =====
CREATE TABLE public.angles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  month date NOT NULL,
  persona text NOT NULL,
  title text NOT NULL,
  content jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'attente_ibra'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.angles ADD CONSTRAINT angles_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id);
ALTER TABLE public.angles ENABLE ROW LEVEL SECURITY;
-- POLICY angles_agency_all (ALL, roles: public)
CREATE POLICY angles_agency_all ON public.angles FOR ALL TO public USING ((my_role() = 'agency'::text)) WITH CHECK ((my_role() = 'agency'::text));
-- POLICY angles_client_read (SELECT, roles: public)
CREATE POLICY angles_client_read ON public.angles FOR SELECT TO public USING ((client_id = my_client_id()));

-- ===== api_tokens =====
CREATE TABLE public.api_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  label text NOT NULL,
  token_hash text NOT NULL,
  scopes text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  revoked_at timestamp with time zone,
  PRIMARY KEY (id)
);

ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id);
-- UNIQUE: api_tokens_token_hash_key (token_hash)
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
-- POLICY api_tokens_agency_all (ALL, roles: public)
CREATE POLICY api_tokens_agency_all ON public.api_tokens FOR ALL TO public USING ((my_role() = 'agency'::text)) WITH CHECK ((my_role() = 'agency'::text));

-- ===== avatars =====
CREATE TABLE public.avatars (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  name text NOT NULL,
  preview_url text,
  chosen boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.avatars ADD CONSTRAINT avatars_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id);
ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;
-- POLICY avatars_client_choose (UPDATE, roles: public)
CREATE POLICY avatars_client_choose ON public.avatars FOR UPDATE TO public USING ((client_id = my_client_id())) WITH CHECK ((client_id = my_client_id()));
-- POLICY avatars_client_read (SELECT, roles: public)
CREATE POLICY avatars_client_read ON public.avatars FOR SELECT TO public USING ((client_id = my_client_id()));
-- POLICY avatars_agency_all (ALL, roles: public)
CREATE POLICY avatars_agency_all ON public.avatars FOR ALL TO public USING ((my_role() = 'agency'::text)) WITH CHECK ((my_role() = 'agency'::text));

-- ===== brain_entries =====
CREATE TABLE public.brain_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  section text NOT NULL,
  kind text NOT NULL,
  title text,
  content text NOT NULL,
  source_url text,
  origin text DEFAULT 'manuel'::text NOT NULL,
  import_id uuid,
  position integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  PRIMARY KEY (id)
);

ALTER TABLE public.brain_entries ADD CONSTRAINT brain_entries_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id);
ALTER TABLE public.brain_entries ENABLE ROW LEVEL SECURITY;
-- POLICY brain_entries_agency_all (ALL, roles: public)
CREATE POLICY brain_entries_agency_all ON public.brain_entries FOR ALL TO public USING ((my_role() = 'agency'::text)) WITH CHECK ((my_role() = 'agency'::text));

-- ===== brain_imports =====
CREATE TABLE public.brain_imports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  url text NOT NULL,
  status text NOT NULL,
  pages_lues integer,
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric,
  worst_case_usd numeric,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.brain_imports ADD CONSTRAINT brain_imports_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id);
ALTER TABLE public.brain_imports ENABLE ROW LEVEL SECURITY;
-- POLICY brain_imports_agency_read (SELECT, roles: public)
CREATE POLICY brain_imports_agency_read ON public.brain_imports FOR SELECT TO public USING ((my_role() = 'agency'::text));

-- ===== brand_dossiers =====
CREATE TABLE public.brand_dossiers (
  client_id uuid NOT NULL,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid,
  PRIMARY KEY (client_id)
);

ALTER TABLE public.brand_dossiers ADD CONSTRAINT brand_dossiers_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id);
ALTER TABLE public.brand_dossiers ADD CONSTRAINT brand_dossiers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users (id);
ALTER TABLE public.brand_dossiers ENABLE ROW LEVEL SECURITY;
-- POLICY dossiers_client_update (UPDATE, roles: public)
CREATE POLICY dossiers_client_update ON public.brand_dossiers FOR UPDATE TO public USING ((client_id = my_client_id())) WITH CHECK ((client_id = my_client_id()));
-- POLICY dossiers_client_write (INSERT, roles: public)
CREATE POLICY dossiers_client_write ON public.brand_dossiers FOR INSERT TO public WITH CHECK ((client_id = my_client_id()));
-- POLICY dossiers_agency_all (ALL, roles: public)
CREATE POLICY dossiers_agency_all ON public.brand_dossiers FOR ALL TO public USING ((my_role() = 'agency'::text)) WITH CHECK ((my_role() = 'agency'::text));
-- POLICY dossiers_client_read (SELECT, roles: public)
CREATE POLICY dossiers_client_read ON public.brand_dossiers FOR SELECT TO public USING ((client_id = my_client_id()));

-- ===== briefs =====
CREATE TABLE public.briefs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  month date NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  status text DEFAULT 'redaction'::text NOT NULL,
  content jsonb DEFAULT '{}'::jsonb NOT NULL,
  source text DEFAULT 'agence'::text NOT NULL,
  validated_by uuid,
  validated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  script_version integer DEFAULT 1 NOT NULL,
  submitted_content jsonb,
  position integer,
  PRIMARY KEY (id)
);

ALTER TABLE public.briefs ADD CONSTRAINT briefs_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES auth.users (id);
ALTER TABLE public.briefs ADD CONSTRAINT briefs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id);
ALTER TABLE public.briefs ENABLE ROW LEVEL SECURITY;
-- POLICY briefs_client_read (SELECT, roles: public)
CREATE POLICY briefs_client_read ON public.briefs FOR SELECT TO public USING (((client_id = my_client_id()) AND (status IS DISTINCT FROM 'redaction'::text)));
-- POLICY briefs_agency_all (ALL, roles: public)
CREATE POLICY briefs_agency_all ON public.briefs FOR ALL TO public USING ((my_role() = 'agency'::text)) WITH CHECK ((my_role() = 'agency'::text));

-- ===== clients =====
CREATE TABLE public.clients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  status text DEFAULT 'onboarding'::text NOT NULL,
  current_step integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  sector text,
  contact_email text,
  PRIMARY KEY (id)
);

-- UNIQUE: clients_slug_key (slug)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
-- POLICY clients_client_read (SELECT, roles: public)
CREATE POLICY clients_client_read ON public.clients FOR SELECT TO public USING ((id = my_client_id()));
-- POLICY clients_agency_all (ALL, roles: public)
CREATE POLICY clients_agency_all ON public.clients FOR ALL TO public USING ((my_role() = 'agency'::text)) WITH CHECK ((my_role() = 'agency'::text));

-- ===== deposits =====
CREATE TABLE public.deposits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  content jsonb DEFAULT '{}'::jsonb NOT NULL,
  source text DEFAULT 'agence'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.deposits ADD CONSTRAINT deposits_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id);
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
-- POLICY deposits_client_read (SELECT, roles: public)
CREATE POLICY deposits_client_read ON public.deposits FOR SELECT TO public USING ((client_id = my_client_id()));
-- POLICY deposits_agency_all (ALL, roles: public)
CREATE POLICY deposits_agency_all ON public.deposits FOR ALL TO public USING ((my_role() = 'agency'::text)) WITH CHECK ((my_role() = 'agency'::text));

-- ===== livrable_comments =====
CREATE TABLE public.livrable_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  livrable_id uuid NOT NULL,
  author uuid,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.livrable_comments ADD CONSTRAINT livrable_comments_author_fkey FOREIGN KEY (author) REFERENCES auth.users (id);
ALTER TABLE public.livrable_comments ADD CONSTRAINT livrable_comments_livrable_id_fkey FOREIGN KEY (livrable_id) REFERENCES public.livrables (id);
ALTER TABLE public.livrable_comments ENABLE ROW LEVEL SECURITY;
-- POLICY comments_client_read (SELECT, roles: public)
CREATE POLICY comments_client_read ON public.livrable_comments FOR SELECT TO public USING ((EXISTS ( SELECT 1
 FROM livrables l
 WHERE ((l.id = livrable_comments.livrable_id) AND (l.client_id = my_client_id())))));
-- POLICY comments_client_insert (INSERT, roles: public)
CREATE POLICY comments_client_insert ON public.livrable_comments FOR INSERT TO public WITH CHECK (((author = auth.uid()) AND (EXISTS ( SELECT 1
 FROM livrables l
 WHERE ((l.id = livrable_comments.livrable_id) AND (l.client_id = my_client_id()))))));
-- POLICY comments_agency_all (ALL, roles: public)
CREATE POLICY comments_agency_all ON public.livrable_comments FOR ALL TO public USING ((my_role() = 'agency'::text)) WITH CHECK ((my_role() = 'agency'::text));

-- ===== livrables =====
CREATE TABLE public.livrables (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  month date NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  file_url text,
  duration_sec integer,
  status text DEFAULT 'en_controle'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.livrables ADD CONSTRAINT livrables_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id);
ALTER TABLE public.livrables ENABLE ROW LEVEL SECURITY;
-- POLICY livrables_agency_all (ALL, roles: public)
CREATE POLICY livrables_agency_all ON public.livrables FOR ALL TO public USING ((my_role() = 'agency'::text)) WITH CHECK ((my_role() = 'agency'::text));
-- POLICY livrables_client_read (SELECT, roles: public)
CREATE POLICY livrables_client_read ON public.livrables FOR SELECT TO public USING ((client_id = my_client_id()));

-- ===== profiles =====
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  role text NOT NULL,
  client_id uuid,
  display_name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users (id);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- POLICY profiles_select_own (SELECT, roles: public)
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO public USING (((id = auth.uid()) OR (my_role() = 'agency'::text)));

-- ===== validations =====
CREATE TABLE public.validations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  item_kind text NOT NULL,
  brief_id uuid,
  item_ref text NOT NULL,
  decision text NOT NULL,
  comment text,
  decided_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.validations ADD CONSTRAINT validations_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users (id);
ALTER TABLE public.validations ADD CONSTRAINT validations_brief_id_fkey FOREIGN KEY (brief_id) REFERENCES public.briefs (id);
ALTER TABLE public.validations ADD CONSTRAINT validations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients (id);
ALTER TABLE public.validations ENABLE ROW LEVEL SECURITY;
-- POLICY validations_agency_all (ALL, roles: public)
CREATE POLICY validations_agency_all ON public.validations FOR ALL TO public USING ((my_role() = 'agency'::text)) WITH CHECK ((my_role() = 'agency'::text));
-- POLICY validations_client_insert (INSERT, roles: public)
CREATE POLICY validations_client_insert ON public.validations FOR INSERT TO public WITH CHECK (((client_id = my_client_id()) AND (decided_by = auth.uid()) AND ((item_kind <> 'script'::text) OR (EXISTS ( SELECT 1
 FROM briefs b
 WHERE ((b.id = validations.brief_id) AND (b.client_id = my_client_id()) AND (b.kind = 'video'::text) AND (b.status = 'attente_client'::text)))))));
-- POLICY validations_client_read (SELECT, roles: public)
CREATE POLICY validations_client_read ON public.validations FOR SELECT TO public USING ((client_id = my_client_id()));
