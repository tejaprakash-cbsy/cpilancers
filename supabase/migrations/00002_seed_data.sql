-- ============================================================================
-- INITIAL SEED DATA: 00002_seed_data.sql
-- SAP Integration Skills & Certifications Master Taxonomy
-- ============================================================================

-- Core SAP Skills
INSERT INTO public.skills (name, slug, category, description) VALUES
('SAP Cloud Integration (CPI)', 'sap-cpi', 'core_cpi', 'SAP Cloud Integration flow development and message processing'),
('SAP Integration Suite', 'sap-integration-suite', 'integration_suite', 'Comprehensive SAP enterprise integration capabilities'),
('API Management', 'api-management', 'integration_suite', 'SAP API Management, rate limiting, security policies, and developer portal'),
('Event Mesh', 'event-mesh', 'integration_suite', 'Event-driven architecture and asynchronous messaging in SAP ecosystem'),
('Open Connectors', 'open-connectors', 'integration_suite', 'Third-party SaaS connectivity through pre-built adapters'),
('Integration Advisor', 'integration-advisor', 'integration_suite', 'Machine-learning guided mapping and message design'),
('SAP S/4HANA Integration', 'sap-s4hana', 'sap_system', 'Integration with SAP S/4HANA Cloud and On-Premise'),
('SAP ECC 6.0', 'sap-ecc', 'sap_system', 'Legacy ERP integration via RFC, IDoc, and BAPI'),
('SAP SuccessFactors', 'sap-successfactors', 'sap_system', 'HR system integration with OData, SFAPI, and CompoundEmployee'),
('SAP Ariba', 'sap-ariba', 'sap_system', 'Procurement integration using cXML and Ariba Cloud Integration Gateway (CIG)'),
('SAP Concur', 'sap-concur', 'sap_system', 'Travel and expense integration via REST APIs'),
('IDoc Processing', 'idoc', 'protocol', 'Intermediate Document parsing, serialization, and ALE auditing'),
('OData V2 / V4', 'odata', 'protocol', 'Open Data Protocol service consumption and exposure'),
('SOAP Web Services', 'soap', 'protocol', 'WSDL, WS-Security, and SOAP 1.1/1.2 message processing'),
('REST APIs', 'rest', 'protocol', 'RESTful API integration with JSON/XML payloads'),
('SFTP / PGP', 'sftp-pgp', 'protocol', 'Secure File Transfer Protocol with PGP encryption/decryption'),
('AS2 / EDI', 'as2-edi', 'protocol', 'Applicability Statement 2 and ANSI X12 / EDIFACT standards'),
('Groovy Scripting', 'groovy-scripting', 'scripting', 'Custom message processing, header manipulation, and routing in CPI'),
('JavaScript in CPI', 'javascript-cpi', 'scripting', 'JavaScript script execution in CPI integration flows'),
('XSLT 2.0 / 3.0', 'xslt', 'scripting', 'High-performance XML transformations in SAP middleware')
ON CONFLICT (name) DO NOTHING;

-- Official SAP Certifications Catalog
INSERT INTO public.certifications (code, name, issuing_authority, validation_url_template) VALUES
('C_CPI_2404', 'SAP Certified Associate - Integration Developer', 'SAP SE', 'https://www.credly.com/org/sap/badge/sap-certified-associate-integration-developer'),
('C_CPE_2409', 'SAP Certified Associate - Backend Developer - SAP Cloud Application Programming Model', 'SAP SE', 'https://www.credly.com/org/sap/badge/sap-certified-associate-backend-developer'),
('C_S4CFI_2408', 'SAP Certified Associate - Implementation Consultant - SAP S/4HANA Cloud Public Edition - Financial Accounting', 'SAP SE', 'https://www.credly.com/org/sap/badge/sap-certified-associate-implementation-consultant-financial-accounting')
ON CONFLICT (code) DO NOTHING;
