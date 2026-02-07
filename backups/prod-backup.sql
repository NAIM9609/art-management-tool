--
-- PostgreSQL database dump
--

\restrict GH0klLB5ishg2bEY6fWFrwEBBm9LEfx2vPNNMaGaNemow8jNTlN12eGTl5AYPIE

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: carts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.products (id, slug, title, short_description, long_description, base_price, currency, sku, gtin, status, character_id, character_value, etsy_link, created_at, updated_at, deleted_at) VALUES (1, 'shirt1', 'Shirt', 'Short', '', 10.00, 'EUR', '123', '', 'published', NULL, 'Leon', 'https://www.google.com/search?q=ciaone&rlz=1C5CHFA_enIT1093IT1093&oq=ciaone&gs_lcrp=EgZjaHJvbWUyCQgAEEUYORiABDIHCAEQABiABDIHCAIQABiABDIHCAMQABiABDIHCAQQABiABDIHCAUQABiABDIHCAYQABiABDIHCAcQABiABDIHCAgQABiABDIHCAkQABiABNIBCTE3NDRqMGoxNagCALACAA&sourceid=chrome&ie=UTF-8', '2025-11-12 21:00:08.475882+00', '2025-11-18 00:36:31.366036+00', '2025-11-25 13:33:08.529075+00');
INSERT INTO public.products (id, slug, title, short_description, long_description, base_price, currency, sku, gtin, status, character_id, character_value, etsy_link, created_at, updated_at, deleted_at) VALUES (4, '0002', 'GIULLARE Ed."DETTI SICILIANI" T-shirt Stampa Fronte-Retro', '', 'Il Totem del Giullare rappresenta il sorriso e il divertimento nel caos: ridere porta alla risata e tutto diventa più leggero.

💬 Detto Siciliano:
“Cu mancia fa muddichi”

🧘 Mantra del totem:
“RIDO E IL MONDO DIVENTA MIO”

Questa t-shirt fa parte della Collezione Animantra, un viaggio illustrato tra i sette archetipi della Ciurma Interiore creati dall’artista Giorgio Privitera.

🌀 Dettagli del prodotto:

- Stampa fronte, retro e targhetta personalizzata
- 100% cotone pettinato e filato ad anelli
- Vestibilità unisex, tessuto morbido e resistente
- Stampa diretta ad alta definizione (DTG), durevole ai lavaggi
- Disponibile in varie taglie (consulta la tabella)

⚙️ Produzione e spedizione:

- Prodotto stampato su richiesta tramite Printify (no sprechi, produzione sostenibile)
- Spedizione 5–10 giorni lavorativi in EU
- Packaging eco-friendly

Ogni Totem della collezione Animantra rappresenta un archetipo interiore: scopri l’intera ciurma su animantra.it

Product features
- Made with 100% Airlume combed and ring-spun cotton for a lightweight, breathable feel.
- Ribbed knit collar retains its shape while providing comfort.
- Side seams help maintain the garment’s shape and structural integrity.
- Tear-away label minimizes skin irritation for a smoother fit.
- Ethically produced with sustainable practices, ensuring fair labor conditions.

Care instructions
- Machine wash: cold (max 30C or 90F)
- Non-chlorine: bleach as needed
- Tumble dry: low heat
- Iron, steam or dry: medium heat
- Do not dryclean


EU representative: HONSON VENTURES LIMITED, gpsr@honsonventures.com, 3, Gnaftis House flat 102, Limassol, Mesa Geitonia, 4003, CY
Product information: Bella+Canvas 3001, 2 year warranty in EU and Northern Ireland as per Directive 1999/44/EC
Warnings, Hazard: For adults, Blank product sourced from Honduras
Care instructions: Machine wash: cold (max 30C or 90F), Non-chlorine: bleach as needed, Tumble dry: low heat, Iron, steam or dry: medium heat, Do not dryclean', 25.00, 'EUR', '12837393891703050447', '', 'published', NULL, 'Giullare', 'https://www.etsy.com/it/listing/4388657748/animantra-giullare-edizione-detti', '2025-11-25 13:53:20.131989+00', '2025-11-26 13:59:45.968398+00', NULL);
INSERT INTO public.products (id, slug, title, short_description, long_description, base_price, currency, sku, gtin, status, character_id, character_value, etsy_link, created_at, updated_at, deleted_at) VALUES (3, 'ddddddddddddddd', 'ddddddddddddd', 'dsdsdsssssssssssss', 'dssssssssssssssssssss', 34243.00, 'EUR', 'dfrwe3432', '23443rfds', 'published', NULL, 'guy', 'suca', '2025-11-24 23:20:18.169119+00', '2025-11-24 23:20:18.169119+00', '2025-11-24 23:21:02.689644+00');
INSERT INTO public.products (id, slug, title, short_description, long_description, base_price, currency, sku, gtin, status, character_id, character_value, etsy_link, created_at, updated_at, deleted_at) VALUES (7, '0011', 'LEON il Camaleonte Ed."DETTI SICILIANI" Felpa Stampa Fronte-Retro', '', 'Il Totem del Camaleonte rappresenta il caos incarnato nel bene, nell''incertezza e nella responsabilità: la guida che nonostante l''insicurezza gestisce gli altri Totem.

💬 Detto Siciliano:
“A lingua n''avi l''ossa ma ti rumpa l''ossa”

🧘 Mantra del totem:
“IO SONO IL CAOS CHE IMPARA A SCEGLIERE QUANDO ESPLODERE”

Questa felpa fa parte della Collezione Animantra, un viaggio illustrato tra i sette archetipi della Ciurma Interiore creati dall’artista Giorgio Privitera.

🌀 Dettagli del prodotto:

- Stampa fronte, retro e targhetta personalizzata
- 100% cotone pettinato e filato ad anelli
- Vestibilità unisex, tessuto morbido e resistente
- Stampa diretta ad alta definizione (DTG), durevole ai lavaggi
- Disponibile in varie taglie (consulta la tabella)

⚙️ Produzione e spedizione:

- Prodotto stampato su richiesta tramite Printify (no sprechi, produzione sostenibile)
- Spedizione 5–10 giorni lavorativi in EU
- Packaging eco-friendly

Ogni Totem della collezione Animantra rappresenta un archetipo interiore: scopri l’intera ciurma su https://giorgiopriviteralab.com/it', 45.00, 'EUR', '14673532687776001109', '', 'published', NULL, 'Leon il Camaleonte', 'https://www.etsy.com/it/listing/4411508601/animantra-leon-il-camaleonte-edizione', '2025-11-26 01:12:50.121035+00', '2025-11-26 14:09:30.357604+00', NULL);
INSERT INTO public.products (id, slug, title, short_description, long_description, base_price, currency, sku, gtin, status, character_id, character_value, etsy_link, created_at, updated_at, deleted_at) VALUES (8, '0012', 'GIULLARE Ed."DETTI SICILIANI" Felpa Stampa Fronte-Retro', '', 'Il Totem del Giullare rappresenta il sorriso e il divertimento nel caos: ridere porta alla risata e tutto diventa più leggero.

💬 Detto Siciliano:
“Cu mancia fa muddichi”

🧘 Mantra del totem:
“RIDO E IL MONDO DIVENTA MIO”

Questa felpa fa parte della Collezione Animantra, un viaggio illustrato tra i sette archetipi della Ciurma Interiore creati dall’artista Giorgio Privitera.

🌀 Dettagli del prodotto:

- Stampa fronte, retro e targhetta personalizzata
- 100% cotone pettinato e filato ad anelli
- Vestibilità unisex, tessuto morbido e resistente
- Stampa diretta ad alta definizione (DTG), durevole ai lavaggi
- Disponibile in varie taglie (consulta la tabella)

⚙️ Produzione e spedizione:

- Prodotto stampato su richiesta tramite Printify (no sprechi, produzione sostenibile)
- Spedizione 5–10 giorni lavorativi in EU
- Packaging eco-friendly

Ogni Totem della collezione Animantra rappresenta un archetipo interiore: scopri l’intera ciurma su https://giorgiopriviteralab.com/it', 45.00, 'EUR', '14839806466913184943', '', 'published', NULL, 'Giullare', 'https://www.etsy.com/it/listing/4412237170/animantra-giullare-edizione-detti', '2025-11-26 13:19:42.829539+00', '2025-11-26 14:09:18.450269+00', NULL);
INSERT INTO public.products (id, slug, title, short_description, long_description, base_price, currency, sku, gtin, status, character_id, character_value, etsy_link, created_at, updated_at, deleted_at) VALUES (6, '0004', 'RIBELLE PIGRO Ed."DETTI SICILIANI" T-shirt Stampa Fronte-Retro', '', 'Il Totem del Ribelle Pigro rappresenta la forza calma nella dinamicità del caos: la capacità di prendersi una pausa anche quando tutto intorno corre.

💬 Detto Siciliano:
“Chiù longa è a pinsata, chiù rossa è a minchiata”

🧘 Mantra del Ribelle Pigro:
“IL MIO CAOS SI CALMA NELLA PAUSA.”

Questa t-shirt fa parte della Collezione Animantra, un viaggio illustrato tra i sette archetipi della Ciurma Interiore creati dall’artista Giorgio Privitera.

🌀 Dettagli del prodotto:

- Stampa fronte, retro e targhetta personalizzata
- 100% cotone pettinato e filato ad anelli
- Vestibilità unisex, tessuto morbido e resistente
- Stampa diretta ad alta definizione (DTG), durevole ai lavaggi
- Disponibile in varie taglie (consulta la tabella)

⚙️ Produzione e spedizione:

- Prodotto stampato su richiesta tramite Printify (no sprechi, produzione sostenibile)
- Spedizione 5–10 giorni lavorativi in EU
- Packaging eco-friendly

Ogni Totem della collezione Animantra rappresenta un archetipo interiore: scopri l’intera ciurma su https://giorgiopriviteralab.com/it', 25.00, 'EUR', '89199737903741344459', '', 'published', NULL, 'Ribelle Pigro', 'https://www.etsy.com/it/listing/4388645068/animantra-ribellepigro-edizione-detti', '2025-11-26 01:07:35.957029+00', '2025-11-26 13:57:01.880519+00', NULL);
INSERT INTO public.products (id, slug, title, short_description, long_description, base_price, currency, sku, gtin, status, character_id, character_value, etsy_link, created_at, updated_at, deleted_at) VALUES (9, '0013', 'POLEMICO Ed."DETTI SICILIANI" Felpa Stampa Fronte-Retro', '', 'Il Totem del Polemico rappresenta la capacità di portare a proprio favore anche le discussioni più irritanti. Il caos che dallla rabbia prende l''energia per controllare il destino.

💬 Detto Siciliano:
“U lupu di mala cuscienza, comu opera pensa!”

🧘 Mantra del totem:
“CONTROLLO IL DISCORSO COME SE FOSSE IL MIO BURATTINO”

Questa felpa fa parte della Collezione Animantra, un viaggio illustrato tra i sette archetipi della Ciurma Interiore creati dall’artista Giorgio Privitera.

🌀 Dettagli del prodotto:

- Stampa fronte, retro e targhetta personalizzata
- 100% cotone pettinato e filato ad anelli
- Vestibilità unisex, tessuto morbido e resistente
- Stampa diretta ad alta definizione (DTG), durevole ai lavaggi
- Disponibile in varie taglie (consulta la tabella)

⚙️ Produzione e spedizione:

- Prodotto stampato su richiesta tramite Printify (no sprechi, produzione sostenibile)
- Spedizione 5–10 giorni lavorativi in EU
- Packaging eco-friendly

Ogni Totem della collezione Animantra rappresenta un archetipo interiore: scopri l’intera ciurma su https://giorgiopriviteralab.com/it', 45.00, 'EUR', '10904249600901764742', '', 'published', NULL, 'Polemico', 'https://www.etsy.com/it/listing/4412238100/animantra-polemico-edizione-detti', '2025-11-26 13:21:12.601079+00', '2025-11-26 14:09:04.801913+00', NULL);
INSERT INTO public.products (id, slug, title, short_description, long_description, base_price, currency, sku, gtin, status, character_id, character_value, etsy_link, created_at, updated_at, deleted_at) VALUES (5, '0003', 'POLEMICO Ed."DETTI SICILIANI" T-shirt Stampa Fronte-Retro', '', 'Il Totem del Polemico rappresenta la capacità di portare a proprio favore anche le discussioni più irritanti. Il caos che dallla rabbia prende l''energia per controllare il destino.

💬 Detto Siciliano:
“U lupu di mala cuscienza, comu opera pensa!”

🧘 Mantra del totem:
“CONTROLLO IL DISCORSO COME SE FOSSE IL MIO BURATTINO”

Questa t-shirt fa parte della Collezione Animantra, un viaggio illustrato tra i sette archetipi della Ciurma Interiore creati dall’artista Giorgio Privitera.

🌀 Dettagli del prodotto:

- Stampa fronte, retro e targhetta personalizzata
- 100% cotone pettinato e filato ad anelli
- Vestibilità unisex, tessuto morbido e resistente
- Stampa diretta ad alta definizione (DTG), durevole ai lavaggi
- Disponibile in varie taglie (consulta la tabella)

⚙️ Produzione e spedizione:

- Prodotto stampato su richiesta tramite Printify (no sprechi, produzione sostenibile)
- Spedizione 5–10 giorni lavorativi in EU
- Packaging eco-friendly

Ogni Totem della collezione Animantra rappresenta un archetipo interiore: scopri l’intera ciurma su https://giorgiopriviteralab.com/it', 25.00, 'EUR', '15016295717442238419', '', 'published', NULL, 'Polemico', 'https://www.etsy.com/it/listing/4395175410/animantra-polemico-edizione-detti', '2025-11-26 01:03:15.875303+00', '2025-11-26 13:56:03.517847+00', NULL);
INSERT INTO public.products (id, slug, title, short_description, long_description, base_price, currency, sku, gtin, status, character_id, character_value, etsy_link, created_at, updated_at, deleted_at) VALUES (10, '0014', 'RIBELLE PIGRO Ed."DETTI SICILIANI" Felpa Stampa Fronte-Retro', '', 'Il Totem del Ribelle Pigro rappresenta la forza calma nella dinamicità del caos: la capacità di prendersi una pausa anche quando tutto intorno corre.

💬 Detto Siciliano:
“Chiù longa è a pinsata, chiù rossa è a minchiata”

🧘 Mantra del Ribelle Pigro:
“IL MIO CAOS SI CALMA NELLA PAUSA.”

Questa felpa fa parte della Collezione Animantra, un viaggio illustrato tra i sette archetipi della Ciurma Interiore creati dall’artista Giorgio Privitera.

🌀 Dettagli del prodotto:

- Stampa fronte, retro e targhetta personalizzata
- 100% cotone pettinato e filato ad anelli
- Vestibilità unisex, tessuto morbido e resistente
- Stampa diretta ad alta definizione (DTG), durevole ai lavaggi
- Disponibile in varie taglie (consulta la tabella)

⚙️ Produzione e spedizione:

- Prodotto stampato su richiesta tramite Printify (no sprechi, produzione sostenibile)
- Spedizione 5–10 giorni lavorativi in EU
- Packaging eco-friendly

Ogni Totem della collezione Animantra rappresenta un archetipo interiore: scopri l’intera ciurma su https://giorgiopriviteralab.com/it', 45.00, 'EUR', '54640181631374796228', '', 'published', NULL, 'Ribelle Pigro', 'https://www.etsy.com/it/listing/4412250397/animantra-ribellepigro-edizione-detti', '2025-11-26 13:30:06.041295+00', '2025-11-26 14:08:52.057603+00', NULL);
INSERT INTO public.products (id, slug, title, short_description, long_description, base_price, currency, sku, gtin, status, character_id, character_value, etsy_link, created_at, updated_at, deleted_at) VALUES (2, '0001', 'LEON il Camaleonte Ed."DETTI SICILIANI" T-shirt Stampa Fronte-Retro', 'dddddddddddddddddddddddd', 'Il Totem del Camaleonte rappresenta il caos incarnato nel bene, nell''incertezza e nella responsabilità: la guida che nonostante l''insicurezza gestisce gli altri Totem.

💬 Detto Siciliano:
“A lingua n''avi l''ossa ma ti rumpa l''ossa”

🧘 Mantra del totem:
“IO SONO IL CAOS CHE IMPARA A SCEGLIERE QUANDO ESPLODERE”

Questa t-shirt fa parte della Collezione Animantra, un viaggio illustrato tra i sette archetipi della Ciurma Interiore creati dall’artista Giorgio Privitera.

🌀 Dettagli del prodotto:

- Stampa fronte, retro e targhetta personalizzata
- 100% cotone pettinato e filato ad anelli
- Vestibilità unisex, tessuto morbido e resistente
- Stampa diretta ad alta definizione (DTG), durevole ai lavaggi
- Disponibile in varie taglie (consulta la tabella)

⚙️ Produzione e spedizione:

- Prodotto stampato su richiesta tramite Printify (no sprechi, produzione sostenibile)
- Spedizione 5–10 giorni lavorativi in EU
- Packaging eco-friendly

Ogni Totem della collezione Animantra rappresenta un archetipo interiore: scopri l’intera ciurma su http://giorgiopriviteralab.com', 25.00, 'EUR', '11888938972061399491', 'ggggggfgfgfrr353423', 'published', NULL, 'Leon il Camaleonte', 'https://www.etsy.com/it/listing/4388662616/animantra-leon-il-camaleonte-edizione', '2025-11-24 23:15:31.735115+00', '2025-12-11 13:41:24.564705+00', NULL);
INSERT INTO public.products (id, slug, title, short_description, long_description, base_price, currency, sku, gtin, status, character_id, character_value, etsy_link, created_at, updated_at, deleted_at) VALUES (11, '0201', 'ANIMANTRA | Mazzo Siciliano | Ed. LUCE ', '', 'Il Mazzo di Animantra, Ed. Luce è arrivato: 40 carte della tradizione siciliana reinterpretate dalla Ciurma Interiore.

Un mini-viaggio nel caos controllato di Animantra, pensato per chi vuole portarsi a casa una parte del progetto… o regalarlo per Natale.

Contenuto della confezione:
- 40 carte formato poker (satinatura professionale 300–330 gsm)
- Packaging rigido illustrato
- Mini-guida introduttiva all’universo Animantra
- Disegni originali e collezionabili

Specifiche tecniche:
- Dimensioni carte: 63×88 mm
- Carta: 300–330 gsm, satinata
- Stampa: full color HD fronte/retro
- Box: cartoncino rigido laminato
- Peso indicativo: 100–130g

Preordine e spedizione:
Spedizione immediata appena i mazzi arrivano (12–14 dicembre previsto)

Ordina entro il 18 dicembre per riceverlo prima di Natale

Spedizione tracciata con tracking

Per chi è pensato:
- Appassionati di carte tradizionali
- Fan della cultura siciliana
- Collezionisti
- Chi segue Animantra
- Idea regalo unica per Natale

Il preordine è attivo ora.
Consegna prevista prima di Natale per tutti gli ordini effettuati rapidamente.', 20.00, 'EUR', '0000000000000', '', 'published', NULL, '', 'https://www.etsy.com/it/listing/4422941693/animantra-mazzo-siciliano-ed-luce', '2025-12-12 11:47:00.32503+00', '2025-12-12 11:47:00.32503+00', NULL);


--
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (1, 1, 'fcfffffffffff', 'ffffff', '{}', 0.00, 1009, '2025-11-14 01:24:32.66262+00', '2025-11-14 01:24:37.18049+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (2, 2, 'fff', 'Small', '{}', 0.00, 40, '2025-11-24 23:17:34.351545+00', '2025-11-24 23:18:32.507942+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (3, 10, '54640181631374796228', 'S', '{}', 0.00, 999, '2025-11-26 13:38:53.432637+00', '2025-11-26 13:38:53.432637+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (4, 10, '24120705644805068779', 'M', '{}', 0.00, 999, '2025-11-26 13:39:10.327597+00', '2025-11-26 13:39:10.327597+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (5, 10, '31745582282917239913', 'L', '{}', 0.00, 999, '2025-11-26 13:39:30.790625+00', '2025-11-26 13:39:30.790625+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (6, 10, '59962127854678899909', 'XL', '{}', 0.00, 999, '2025-11-26 13:39:43.091068+00', '2025-11-26 13:39:43.091068+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (7, 10, '13554846619876801729', '2XL', '{}', 0.00, 999, '2025-11-26 13:39:56.173833+00', '2025-11-26 13:39:56.173833+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (8, 10, '17535051495308568308', '3XL', '{}', 5.00, 999, '2025-11-26 13:40:14.831821+00', '2025-11-26 13:40:14.831821+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (9, 10, '26165539678379969128', '4XL', '{}', 5.00, 999, '2025-11-26 13:40:36.166102+00', '2025-11-26 13:40:36.166102+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (10, 10, '27430962493932589567', '5XL', '{}', 5.00, 999, '2025-11-26 13:40:51.563691+00', '2025-11-26 13:40:51.563691+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (11, 9, '10904249600901764742', 'S', '{}', 0.00, 999, '2025-11-26 13:46:04.597308+00', '2025-11-26 13:46:04.597308+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (12, 8, '12837393891703050447', 'S', '{}', 0.00, 999, '2025-11-26 13:48:07.561016+00', '2025-11-26 13:48:07.561016+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (13, 7, '30594750468071518013', 'S', '{}', 0.00, 999, '2025-11-26 13:50:09.875997+00', '2025-11-26 13:50:09.875997+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (14, 5, '15016295717442238419', 'S', '{}', 0.00, 999, '2025-11-26 13:54:46.678753+00', '2025-11-26 13:54:46.678753+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (15, 6, '89199737903741344459', 'S', '{}', 0.00, 999, '2025-11-26 13:57:14.386415+00', '2025-11-26 13:57:14.386415+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (16, 4, '16399959668355833058', 'M', '{}', 0.00, 999, '2025-11-26 14:02:58.908023+00', '2025-11-26 14:02:58.908023+00', NULL);
INSERT INTO public.product_variants (id, product_id, sku, name, attributes, price_adjustment, stock, created_at, updated_at, deleted_at) VALUES (17, 11, '000000000000000', 'ANIMANTRA | Mazzo Siciliano | Ed. LUCE', '{}', 0.00, 100, '2025-12-12 11:47:29.78143+00', '2025-12-12 11:48:09.449021+00', NULL);


--
-- Data for Name: cart_items; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: discount_codes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: etsy_inventory_sync_log; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: etsy_oauth_tokens; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: etsy_products; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: etsy_receipts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: etsy_sync_config; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: fumetti; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.fumetti (id, title, description, cover_image, pages, "order", created_at, updated_at, deleted_at) VALUES (1, 'gggggggggg', 'ggggggggggggg', '/uploads/fumetti/1/gggggggggg_cover_30a95a5b.png', '["/uploads/fumetti/1/gggggggggg_page_01c15df7.png", "/uploads/fumetti/1/gggggggggg_page_91d41c0e.png", "/uploads/fumetti/1/gggggggggg_page_21a4487e.png", "/uploads/fumetti/1/gggggggggg_page_23463a16.png", "/uploads/fumetti/1/gggggggggg_page_c886d24d.png", "/uploads/fumetti/1/gggggggggg_page_4ab698b5.png", "/uploads/fumetti/1/gggggggggg_page_590e2af6.png"]', 0, '2025-11-14 01:22:22.60322+00', '2025-11-17 15:34:09.982093+00', '2025-11-17 15:34:09.981858+00');


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: personaggi; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.personaggi (id, name, description, icon, images, background_color, background_type, gradient_from, gradient_to, background_image, "order", created_at, updated_at, deleted_at) VALUES (3, 'eliminare', 'Lorem ipsum dolor sit amet, consectetur adipisci elit, sed eiusmod tempor incidunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. Quis aute iure reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint obcaecat cupiditat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.', '/uploads/personaggi/3/Giullare_icon_07d6481a.png', '["/uploads/personaggi/3/Giullare_gallery_749be5b2.png", "/uploads/personaggi/3/Giullare_gallery_0d53bc53.png", "/uploads/personaggi/3/Giullare_gallery_a7633ef5.png", "/uploads/personaggi/3/Giullare_gallery_2b761f98.png", "/uploads/personaggi/3/Giullare_gallery_8356ef3b.png", "/uploads/personaggi/3/Giullare_gallery_b118daee.png", "/uploads/personaggi/3/Giullare_gallery_fb3bdea5.png", "/uploads/personaggi/3/Giullare_gallery_798cc29b.png", "/uploads/personaggi/3/Giullare_gallery_9a3f3c1c.png"]', '#E0E7FF', 'image', '', '', '', 6, '2025-11-19 16:28:48.341778+00', '2025-11-28 01:38:17.801516+00', NULL);
INSERT INTO public.personaggi (id, name, description, icon, images, background_color, background_type, gradient_from, gradient_to, background_image, "order", created_at, updated_at, deleted_at) VALUES (1, 'LEON il Camaleonte', 'ora la sistemo', '/uploads/personaggi/1/LEON_il_Camaleonte_icon_b6131938.png', '["/uploads/personaggi/1/LEON_il_Camaleonte_gallery_ec253edd.png", "/uploads/personaggi/1/LEON_il_Camaleonte_gallery_c8d8d50b.png", "/uploads/personaggi/1/LEON_il_Camaleonte_gallery_10f5abb1.png", "/uploads/personaggi/1/LEON_il_Camaleonte_gallery_47d206c9.png", "/uploads/personaggi/1/LEON_il_Camaleonte_gallery_64e84e6d.png", "/uploads/personaggi/1/LEON_il_Camaleonte_gallery_3896f1d8.png", "/uploads/personaggi/1/LEON_il_Camaleonte_gallery_2f0f01fa.png", "/uploads/personaggi/1/LEON_il_Camaleonte_gallery_25b42b62.png", "/uploads/personaggi/1/LEON_il_Camaleonte_gallery_ad839a6a.png", "/uploads/personaggi/1/LEON_il_Camaleonte_gallery_dc657380.png", "/uploads/personaggi/1/LEON_il_Camaleonte_gallery_e1214956.png"]', '#E0E7FF', 'image', '', '', '/uploads/personaggi/1/LEON_il_Camaleonte_background_3243cd0b.png', 1, '2025-11-11 17:23:19.111728+00', '2025-11-17 15:34:58.007155+00', '2025-11-17 15:34:58.006934+00');
INSERT INTO public.personaggi (id, name, description, icon, images, background_color, background_type, gradient_from, gradient_to, background_image, "order", created_at, updated_at, deleted_at) VALUES (4, 'eliminare', 'Lorem ipsum dolor sit amet, consectetur adipisci elit, sed eiusmod tempor incidunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. Quis aute iure reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint obcaecat cupiditat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.', '/uploads/personaggi/4/Polemico_icon_c6d81a89.png', '["/uploads/personaggi/4/Polemico_gallery_ba4bc6b5.png", "/uploads/personaggi/4/Polemico_gallery_33515465.png", "/uploads/personaggi/4/Polemico_gallery_3af05e96.png", "/uploads/personaggi/4/Polemico_gallery_daedb5c9.png", "/uploads/personaggi/4/Polemico_gallery_698ea9fd.png", "/uploads/personaggi/4/Polemico_gallery_84065c0a.png", "/uploads/personaggi/4/Polemico_gallery_44310ff8.png", "/uploads/personaggi/4/Polemico_gallery_c14c15c5.png"]', '#E0E7FF', 'solid', '', '', '', 8, '2025-11-19 16:29:49.576982+00', '2025-11-28 01:38:30.550535+00', NULL);
INSERT INTO public.personaggi (id, name, description, icon, images, background_color, background_type, gradient_from, gradient_to, background_image, "order", created_at, updated_at, deleted_at) VALUES (7, 'Giullare', '"RIDO E IL MONDO DIVENTA MIO"

Il giullare è il membro più variopinto e allegro della ciurma, si muove e balla sempre con il sorriso. Assomiglia ad un bonobo unito ad una scimmia ragno. 

Molto caotico, non si muove per impressionare o distruggere, si muove ballando per creare la realtà a modo suo, divertente e allegra. Come un bambino gioca, e il suo scopo è ridere e far ridere.', '/uploads/personaggi/7/Giullare_icon_2ff2f538.png', '["/uploads/personaggi/7/Giullare_gallery_5ac11330.png", "/uploads/personaggi/7/Giullare_gallery_3110f3e8.jpeg", "/uploads/personaggi/7/Giullare_gallery_6813c387.jpg"]', '#CA9046', 'gradient', '#CA9046', '#235592', '', 2, '2025-11-28 00:17:56.066279+00', '2025-12-10 10:31:09.984862+00', NULL);
INSERT INTO public.personaggi (id, name, description, icon, images, background_color, background_type, gradient_from, gradient_to, background_image, "order", created_at, updated_at, deleted_at) VALUES (8, 'Polemico', '"CONTROLLO IL DISCORSO COME SE FOSSE IL MIO BURATTINO"

Il Polemico è una iena che vorrebbe esplodere quando sente certe sT#0n$+te, ma piuttosto che uccidere chi ha davanti, per fare un favore all''umanità intera naturalmente; sceglie di “far buon viso a cattivo gioco” con sarcasmo e battute pungenti, che di solito fanno innervosire chi “si sente toccato” e aumentano il divertimento del Polemico.


Ha uno strano rapporto con Tetris', '/uploads/personaggi/8/Polemico_icon_40baa8ac.png', '["/uploads/personaggi/8/Polemico_gallery_c1d5f979.png", "/uploads/personaggi/8/Polemico_gallery_8c4762eb.jpeg", "/uploads/personaggi/8/Polemico_gallery_2224f5e2.jpg"]', '#E0E7FF', 'gradient', '#ba443f', '#B58A9E', '', 3, '2025-11-28 00:32:24.452497+00', '2025-12-10 10:32:11.467872+00', NULL);
INSERT INTO public.personaggi (id, name, description, icon, images, background_color, background_type, gradient_from, gradient_to, background_image, "order", created_at, updated_at, deleted_at) VALUES (5, 'eliminare', 'Lorem ipsum dolor sit amet, consectetur adipisci elit, sed eiusmod tempor incidunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. Quis aute iure reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint obcaecat cupiditat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.', '/uploads/personaggi/5/Ribelle_Pigro_icon_fac35353.png', '["/uploads/personaggi/5/Ribelle_Pigro_gallery_466041d5.png", "/uploads/personaggi/5/Ribelle_Pigro_gallery_e38f27e1.png", "/uploads/personaggi/5/Ribelle_Pigro_gallery_3a71e0d5.png", "/uploads/personaggi/5/Ribelle_Pigro_gallery_5f55e9fc.png", "/uploads/personaggi/5/Ribelle_Pigro_gallery_f5f7124a.png", "/uploads/personaggi/5/Ribelle_Pigro_gallery_e23e40d8.png", "/uploads/personaggi/5/Ribelle_Pigro_gallery_b87d16d3.png", "/uploads/personaggi/5/Ribelle_Pigro_gallery_516aa1f7.png"]', '#E0E7FF', 'solid', '', '', '', 7, '2025-11-19 16:30:25.411812+00', '2025-11-28 01:38:24.296946+00', NULL);
INSERT INTO public.personaggi (id, name, description, icon, images, background_color, background_type, gradient_from, gradient_to, background_image, "order", created_at, updated_at, deleted_at) VALUES (6, 'eliminare', 'Lorem ipsum dolor sit amet, consectetur adipisci elit, sed eiusmod tempor incidunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. Quis aute iure reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint obcaecat cupiditat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.', '/uploads/personaggi/6/u_babbu_sutta_o_linzolu_icon_6ea4834e.png', '["/uploads/personaggi/6/u_babbu_sutta_o_linzolu_gallery_be77e0f7.png", "/uploads/personaggi/6/u_babbu_sutta_o_linzolu_gallery_d31fc370.png", "/uploads/personaggi/6/u_babbu_sutta_o_linzolu_gallery_5364c579.png", "/uploads/personaggi/6/u_babbu_sutta_o_linzolu_gallery_1f03dd73.png", "/uploads/personaggi/6/u_babbu_sutta_o_linzolu_gallery_558abcd8.png", "/uploads/personaggi/6/u_babbu_sutta_o_linzolu_gallery_37ab0c04.png", "/uploads/personaggi/6/u_babbu_sutta_o_linzolu_gallery_81cbcd80.png", "/uploads/personaggi/6/u_babbu_sutta_o_linzolu_gallery_0c8e227e.png"]', '#004080', 'solid', '', '', '', 5, '2025-11-19 16:31:26.801063+00', '2025-11-28 01:38:41.641404+00', NULL);
INSERT INTO public.personaggi (id, name, description, icon, images, background_color, background_type, gradient_from, gradient_to, background_image, "order", created_at, updated_at, deleted_at) VALUES (9, 'Ribelle Pigro', '"IL MIO CAOS SI CALMA NELLA PAUSA"

Il Ribelle Pigro è un grosso panda forte fortissimocosìfortechepotrebbespaccaretuttelestecchechefumisehailettofinqui... che però viene fuori quando c’è da raaalleeentaare. 

Mentre tutti gli altri corrono il Ribelle Pigro si prende i suoi tempi, proteggendo da critiche e ingiustizie, fumando la sua pipa. 

Nonostante sia pigro, se spronato abbastanza è capace di tenere a bada parecchi nemici, usando la pipa con stesso fumo che usa per disegnare e per... fumare, ovvio.
', '/uploads/personaggi/9/Ribelle_Pigro_icon_c356314d.png', '["/uploads/personaggi/9/Ribelle_Pigro_gallery_59af1549.PNG", "/uploads/personaggi/9/Ribelle_Pigro_gallery_33046a19.jpeg", "/uploads/personaggi/9/Ribelle_Pigro_gallery_7f1eb8a7.jpg"]', '#E0E7FF', 'gradient', '#C5DEE2', '#303e73', '', 4, '2025-11-28 00:42:51.393632+00', '2025-12-10 10:33:02.929279+00', NULL);
INSERT INTO public.personaggi (id, name, description, icon, images, background_color, background_type, gradient_from, gradient_to, background_image, "order", created_at, updated_at, deleted_at) VALUES (2, 'Leon il Camaleonte', '"IO SONO IL CAOS CHE IMPARA A SCEGLIERE QUANDO ESPLODERE"

Leon è un camaLEONte che non sa mimetizzarsi autonomamente, cerca di “mimetizzarsi” nella società, tra successi ed errori, ed è un “eroe per caso” buono, pieno di potenzialità ma con poca autostima, che cerca di forzarsi a fare del meglio e a volte non si rende conto di come riesce ad avere successo. 

La società lo reputa strano, anche se è semplicemente particolare a modo suo. 
A causa delle turbe che gli affollano la mente vengono richiamete 6 entità che lo chiamano Capitano (buffo per un tipo che a malapena sa abbinare i colori dei vestiti).
Leon deve prendersi la responsabilità di dirigerli, creando così Animantra.

Nonostante i dubbi comunque cerca sempre di fare del suo meglio, per il suo bene, della ciurma, dei suoi cari, nelle difficoltà delle circostanze (è più semplice creare il circo nelle stanze).', '/uploads/personaggi/2/Leon_il_Camaleonte_icon_289d954c.png', '["/uploads/personaggi/2/Leon_il_Camaleonte_gallery_65498d83.png", "/uploads/personaggi/2/Leon_il_Camaleonte_gallery_067dd34c.png", "/uploads/personaggi/2/Leon_il_Camaleonte_gallery_3362e13d.jpeg", "/uploads/personaggi/2/Leon_il_Camaleonte_gallery_a1bfe6fb.jpg"]', '#E0E7FF', 'gradient', '#89b771', '#716498', '/uploads/personaggi/2/Leon_background_00d273c5.png', 1, '2025-11-17 15:35:29.516167+00', '2025-12-10 10:30:01.887879+00', NULL);


--
-- Data for Name: product_categories; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: product_images; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (1, 1, '/uploads/products/1/product_93bcd0b0.png', '', 0, '2025-11-12 21:00:20.672612+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (2, 1, '/uploads/products/1/product_40e88369.jpg', '', 1, '2025-11-12 21:16:14.916083+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (61, 4, '/uploads/products/4/product_67920b27.jpg', '', 1, '2025-12-11 13:40:19.812925+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (64, 4, '/uploads/products/4/product_19f82e3d.jpg', '', 1, '2025-12-11 13:44:20.985893+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (65, 4, '/uploads/products/4/product_a2c0a67a.jpg', '', 2, '2025-12-11 13:44:24.134705+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (63, 2, '/uploads/products/2/product_e6e6e652.jpg', '', 0, '2025-12-11 13:40:57.01069+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (62, 2, '/uploads/products/2/product_85463ae2.jpg', '', 1, '2025-12-11 13:40:56.812033+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (67, 7, '/uploads/products/7/product_a06c9903.jpg', '', 0, '2025-12-11 13:46:34.410383+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (68, 7, '/uploads/products/7/product_2c21e4d5.jpg', '', 1, '2025-12-11 13:46:39.679132+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (45, 9, '/uploads/products/9/product_bb81cb3c.jpg', '', 0, '2025-12-11 13:09:12.579745+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (69, 7, '/uploads/products/7/product_b5014732.jpg', '', 2, '2025-12-11 13:46:45.300488+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (73, 11, '/uploads/products/11/product_2eb73cf6.jpg', '', 0, '2025-12-12 11:47:39.535975+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (70, 11, '/uploads/products/11/product_6fc71bd1.jpg', '', 1, '2025-12-12 11:47:38.463025+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (42, 10, '/uploads/products/10/product_b1aa0f1b.jpg', '', 0, '2025-12-11 13:01:19.522583+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (72, 11, '/uploads/products/11/product_c2132153.jpg', '', 1, '2025-12-12 11:47:39.256539+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (41, 10, '/uploads/products/10/product_f0d209d9.jpg', '', 1, '2025-12-11 13:01:19.196264+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (71, 11, '/uploads/products/11/product_840c51fb.jpg', '', 0, '2025-12-12 11:47:38.739401+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (43, 10, '/uploads/products/10/product_58a55b30.jpg', '', 2, '2025-12-11 13:01:19.747851+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (48, 8, '/uploads/products/8/product_6f200339.jpg', '', 0, '2025-12-11 13:10:22.201693+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (44, 9, '/uploads/products/9/product_cc44a735.jpg', '', 1, '2025-12-11 13:09:12.275072+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (46, 9, '/uploads/products/9/product_b1c57137.jpg', '', 2, '2025-12-11 13:09:12.750295+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (74, 11, '/uploads/products/11/product_f5d9308e.jpg', '', 4, '2025-12-12 11:47:40.096902+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (47, 8, '/uploads/products/8/product_59e1e5df.jpg', '', 1, '2025-12-11 13:10:22.055303+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (49, 8, '/uploads/products/8/product_e70055d2.jpg', '', 2, '2025-12-11 13:10:22.367255+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (55, 6, '/uploads/products/6/product_259df7ea.jpg', '', 0, '2025-12-11 13:39:06.472515+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (54, 6, '/uploads/products/6/product_f99cab3e.jpg', '', 1, '2025-12-11 13:39:05.965158+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (53, 6, '/uploads/products/6/product_40638ac5.jpg', '', 2, '2025-12-11 13:39:05.843654+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (58, 5, '/uploads/products/5/product_c24be613.jpg', '', 0, '2025-12-11 13:39:45.034212+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (57, 5, '/uploads/products/5/product_6af73f43.jpg', '', 1, '2025-12-11 13:39:44.7493+00');
INSERT INTO public.product_images (id, product_id, url, alt_text, "position", created_at) VALUES (56, 5, '/uploads/products/5/product_413a0ac1.jpg', '', 2, '2025-12-11 13:39:44.648822+00');


--
-- Data for Name: shopify_links; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 1, false);


--
-- Name: cart_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cart_items_id_seq', 1, false);


--
-- Name: carts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.carts_id_seq', 1, false);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categories_id_seq', 1, false);


--
-- Name: discount_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.discount_codes_id_seq', 1, false);


--
-- Name: etsy_inventory_sync_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.etsy_inventory_sync_log_id_seq', 1, false);


--
-- Name: etsy_oauth_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.etsy_oauth_tokens_id_seq', 1, false);


--
-- Name: etsy_products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.etsy_products_id_seq', 1, false);


--
-- Name: etsy_receipts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.etsy_receipts_id_seq', 1, false);


--
-- Name: etsy_sync_config_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.etsy_sync_config_id_seq', 1, false);


--
-- Name: fumetti_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.fumetti_id_seq', 1, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notifications_id_seq', 1, false);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_items_id_seq', 1, false);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.orders_id_seq', 1, false);


--
-- Name: personaggi_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.personaggi_id_seq', 9, true);


--
-- Name: product_images_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_images_id_seq', 74, true);


--
-- Name: product_variants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_variants_id_seq', 17, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.products_id_seq', 11, true);


--
-- Name: shopify_links_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shopify_links_id_seq', 1, false);


--
-- PostgreSQL database dump complete
--

\unrestrict GH0klLB5ishg2bEY6fWFrwEBBm9LEfx2vPNNMaGaNemow8jNTlN12eGTl5AYPIE