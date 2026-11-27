export interface SeedPersona {
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

export interface SeedCategory {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}

export interface SeedReply {
  authorEmail: string;
  body: string;
  hoursAfterThread: number;
  isAccepted?: boolean;
  voterEmails: string[];
}

export interface SeedDiscussion {
  key: string;
  categorySlug: string;
  authorEmail: string;
  title: string;
  body: string;
  isPinned?: boolean;
  viewCount: number;
  daysAgo: number;
  voterEmails: string[];
  replies: SeedReply[];
}

export const SEED_EMAIL_DOMAIN = '@seed.cpilancers.com';

export const LEGACY_CATEGORY_SLUGS = [
  'sap-integration',
  'development',
  'ai-automation',
  'cybersecurity',
  'freelancing',
  'career',
  'projects',
  'troubleshooting',
  'general',
] as const;

export const SEED_PERSONAS: SeedPersona[] = [
  {
    email: 'arjun.mehta@seed.cpilancers.com',
    firstName: 'Arjun',
    lastName: 'Mehta',
    displayName: 'Arjun Mehta',
  },
  {
    email: 'priya.nair@seed.cpilancers.com',
    firstName: 'Priya',
    lastName: 'Nair',
    displayName: 'Priya Nair',
  },
  {
    email: 'karthik.rao@seed.cpilancers.com',
    firstName: 'Karthik',
    lastName: 'Rao',
    displayName: 'Karthik Rao',
  },
  {
    email: 'sneha.kulkarni@seed.cpilancers.com',
    firstName: 'Sneha',
    lastName: 'Kulkarni',
    displayName: 'Sneha Kulkarni',
  },
  {
    email: 'rohan.deshmukh@seed.cpilancers.com',
    firstName: 'Rohan',
    lastName: 'Deshmukh',
    displayName: 'Rohan Deshmukh',
  },
  {
    email: 'ananya.iyer@seed.cpilancers.com',
    firstName: 'Ananya',
    lastName: 'Iyer',
    displayName: 'Ananya Iyer',
  },
  {
    email: 'vikram.singh@seed.cpilancers.com',
    firstName: 'Vikram',
    lastName: 'Singh',
    displayName: 'Vikram Singh',
  },
  {
    email: 'deepa.menon@seed.cpilancers.com',
    firstName: 'Deepa',
    lastName: 'Menon',
    displayName: 'Deepa Menon',
  },
  {
    email: 'siddharth.joshi@seed.cpilancers.com',
    firstName: 'Siddharth',
    lastName: 'Joshi',
    displayName: 'Siddharth Joshi',
  },
  {
    email: 'meera.krishnan@seed.cpilancers.com',
    firstName: 'Meera',
    lastName: 'Krishnan',
    displayName: 'Meera Krishnan',
  },
];

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    slug: 'cpi-development-groovy',
    name: 'CPI Development & Groovy',
    description:
      'iFlow design, Groovy scripting, XSLT, Message Mapping, and payload transformation patterns.',
    sortOrder: 1,
  },
  {
    slug: 'pipo-migration',
    name: 'PI/PO to Integration Suite',
    description:
      'SAP PO 7.5 assessment, Edge Integration Cell (EIC), ccBPM, UDFs, and cutover testing.',
    sortOrder: 2,
  },
  {
    slug: 'adapters-s4hana-security',
    name: 'Adapters, S/4HANA & Security',
    description:
      'OData, SFTP, IDoc, JMS, Cloud Connector, OAuth2 SAML Bearer, and API Management.',
    sortOrder: 3,
  },
  {
    slug: 'error-handling-ops',
    name: 'Error Handling & Operations',
    description:
      'Exception subprocesses, JMS retries, MPL sizing, Cloud ALM alerting, and CI/CD.',
    sortOrder: 4,
  },
  {
    slug: 'careers-projects-india',
    name: 'Careers & Projects (India)',
    description:
      'Certifications, INR consulting rates, architecture transitions, and project scoping.',
    sortOrder: 5,
  },
];

export const SEED_DISCUSSIONS: SeedDiscussion[] = [
  // =========================================================================
  // 1. CPI Development & Groovy (5 threads)
  // =========================================================================
  {
    key: 'groovy-1x-to-2x-4x-upgrade',
    categorySlug: 'cpi-development-groovy',
    authorEmail: 'arjun.mehta@seed.cpilancers.com',
    title: 'Groovy 1.x to 2.x/4.0 upgrade readiness checks across 120+ iFlows',
    body: `We are preparing our BTP Integration Suite tenant for the Groovy runtime upgrade from 1.x (and older 2.4 scripts) to Groovy 4.0. Many of our legacy iFlows were migrated years ago and still use older XML/JSON imports.

Before we run regression across 120+ iFlows, what are the highest-risk breaking changes you actually hit in production? Specifically:
1. Package renames like groovy.util.XmlSlurper vs groovy.xml.XmlSlurper
2. Strictness around raw Map/List casting or missing def declarations
3. Deprecated StringBuffer/GString behaviors in Message Mapping UDFs

Would appreciate a checklist we can automate against our Git repository before deploying to QA.`,
    viewCount: 118,
    daysAgo: 19,
    voterEmails: [
      'priya.nair@seed.cpilancers.com',
      'karthik.rao@seed.cpilancers.com',
      'sneha.kulkarni@seed.cpilancers.com',
      'vikram.singh@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'karthik.rao@seed.cpilancers.com',
        hoursAfterThread: 3,
        isAccepted: true,
        voterEmails: [
          'arjun.mehta@seed.cpilancers.com',
          'priya.nair@seed.cpilancers.com',
          'deepa.menon@seed.cpilancers.com',
        ],
        body: `We just finished upgrading 95 iFlows on our EU10 and IN30 tenants. The biggest silent failures were:

1. XmlSlurper and XmlParser package move:
In Groovy 4, groovy.util.XmlSlurper is removed. You must import groovy.xml.XmlSlurper and groovy.xml.XmlParser.

2. JsonOutput and JsonSlurper package check:
Both stay in groovy.json.*, which is safe, but check any custom classes importing org.codehaus.groovy.* because Groovy 4 moved core internals to org.apache.groovy.*.

3. Date.parse() and TimeZone helpers:
If any script calls Date.parse('yyyy-MM-dd', str), you need groovy-dateutil or better yet, switch to java.time.LocalDate / ZonedDateTime so it is JDK-native and immune to future Groovy bumps:

    import java.time.ZonedDateTime
    import java.time.ZoneId
    def istNow = ZonedDateTime.now(ZoneId.of('Asia/Kolkata'))

4. Static grep check in CI:
Grep your repo for "groovy.util.Xml", "org.codehaus.groovy", and ".parse(" before touching any iFlow manually.`,
      },
      {
        authorEmail: 'sneha.kulkarni@seed.cpilancers.com',
        hoursAfterThread: 7,
        voterEmails: ['arjun.mehta@seed.cpilancers.com'],
        body: `Also watch out for switch statements on GString vs String if any script interpolates a property inside a case label, and verify any third-party JARs uploaded as Script Archives. An old commons-lang or poi JAR that calls Groovy metaClass methods can throw MissingMethodException at runtime even though the iFlow deploys cleanly.`,
      },
      {
        authorEmail: 'priya.nair@seed.cpilancers.com',
        hoursAfterThread: 12,
        voterEmails: ['karthik.rao@seed.cpilancers.com'],
        body: `Adding to Karthik's point on java.time: we replaced all SimpleDateFormat and Date.parse calls during our readiness sprint. Not only did it clear Groovy 4 compatibility, it also fixed subtle thread-safety bugs when SimpleDateFormat was accidentally stored at script level.`,
      },
    ],
  },
  {
    key: 'jsonslurper-lazymap-vs-list-xml',
    categorySlug: 'cpi-development-groovy',
    authorEmail: 'sneha.kulkarni@seed.cpilancers.com',
    title: 'JsonSlurper LazyMap vs List gotcha when converting S/4HANA JSON to XML',
    body: `Hit a classic issue in an iFlow receiving JSON from a third-party WMS and converting it to S/4HANA IDoc XML.

When the WMS sends multiple line items, items is an ArrayList. When there is only 1 line item, their API serializes items as a JSON object (LazyMap in Groovy) instead of a 1-element array! Our Groovy script does payload.items.each { item -> ... }, which iterates over Map keys instead of item objects when only 1 item arrives.

How do you handle this cleanly without writing brittle if/else blocks for every nested node?`,
    viewCount: 94,
    daysAgo: 17,
    voterEmails: [
      'arjun.mehta@seed.cpilancers.com',
      'rohan.deshmukh@seed.cpilancers.com',
      'meera.krishnan@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'rohan.deshmukh@seed.cpilancers.com',
        hoursAfterThread: 2,
        isAccepted: true,
        voterEmails: [
          'sneha.kulkarni@seed.cpilancers.com',
          'arjun.mehta@seed.cpilancers.com',
          'karthik.rao@seed.cpilancers.com',
        ],
        body: `Write a tiny normalization helper in Groovy so every downstream loop always receives a List, whether the source sent null, a single Map, or a List:

    def asList = { node ->
        if (node == null) return []
        return (node instanceof List) ? node : [node]
    }

    asList(payload.items).each { item ->
        // item is guaranteed to be a Map here
    }

If you are using the standard CPI JSON-to-XML Converter step before a Message Mapping instead of Groovy, make sure your target XSD sets maxOccurs="unbounded" on <items> and use the "Add Wrapper Element" option so the mapping treats single and multiple occurrences identically.`,
      },
      {
        authorEmail: 'meera.krishnan@seed.cpilancers.com',
        hoursAfterThread: 6,
        voterEmails: ['sneha.kulkarni@seed.cpilancers.com'],
        body: `Rohan's asList closure is exact. One extra tip: if you also have nested sub-items (like batch splits inside each line item), apply asList() at every level you iterate. Never assume the child node is a List just because the parent was.`,
      },
    ],
  },
  {
    key: 'static-global-variables-worker-thread-reuse',
    categorySlug: 'cpi-development-groovy',
    authorEmail: 'vikram.singh@seed.cpilancers.com',
    title: 'Why static or script-level variables leak data across messages in CPI',
    body: `During load testing on a 2-node CPI tenant, we saw Customer A's order reference intermittently appear inside Customer B's payload! After two days of debugging, we found a developer had declared a helper Map at the top of a Groovy script without def/local scope inside processData().

Can someone explain how CPI caches compiled Groovy script instances across worker threads, and how to audit existing scripts for shared-state bugs?`,
    viewCount: 132,
    daysAgo: 15,
    voterEmails: [
      'karthik.rao@seed.cpilancers.com',
      'ananya.iyer@seed.cpilancers.com',
      'deepa.menon@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'ananya.iyer@seed.cpilancers.com',
        hoursAfterThread: 2,
        isAccepted: true,
        voterEmails: [
          'vikram.singh@seed.cpilancers.com',
          'karthik.rao@seed.cpilancers.com',
        ],
        body: `In SAP Cloud Integration, Groovy scripts are compiled into a single class instance per iFlow deployment and reused concurrently by Camel worker threads.

Anything declared as static, @Field, or without a local type/def inside the script binding is shared across concurrent messages:

    // DANGEROUS - shared across threads
    static Map cache = [:]
    myList = []

    // SAFE - local to each processData() invocation
    def Message processData(Message message) {
        def localList = []
        return message
    }

To audit your tenant:
1. Search all .groovy files for "static " and "@Field".
2. Check for undeclared variables (assignments without def, final, or an explicit type inside processData or helper methods).
3. Keep all mutable state inside processData() or pass it as parameters to helper methods. If you need cross-message state, use Data Store or Value Mapping, never JVM memory.`,
      },
      {
        authorEmail: 'arjun.mehta@seed.cpilancers.com',
        hoursAfterThread: 8,
        voterEmails: ['vikram.singh@seed.cpilancers.com'],
        body: `Message Mapping UDFs have the exact same trap if you use GlobalContainer or class-level fields on the mapping class. Always initialize variables inside the UDF method body or clean them up explicitly per message.`,
      },
    ],
  },
  {
    key: 'large-csv-streaming-without-oom',
    categorySlug: 'cpi-development-groovy',
    authorEmail: 'deepa.menon@seed.cpilancers.com',
    title: 'Streaming 80MB+ SFTP CSV files in Groovy without hitting OutOfMemoryError',
    body: `We receive a daily 85MB payroll/time-sheet CSV from an SFTP server that needs filtering and batching into 1,000-row chunks before calling S/4HANA.

Doing message.getBody(String.class) followed by .readLines() crashed our worker node with java.lang.OutOfMemoryError: Java heap space. What is the cleanest streaming pattern in CPI?`,
    viewCount: 109,
    daysAgo: 12,
    voterEmails: [
      'arjun.mehta@seed.cpilancers.com',
      'siddharth.joshi@seed.cpilancers.com',
      'priya.nair@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'siddharth.joshi@seed.cpilancers.com',
        hoursAfterThread: 4,
        isAccepted: true,
        voterEmails: [
          'deepa.menon@seed.cpilancers.com',
          'arjun.mehta@seed.cpilancers.com',
        ],
        body: `Two options work reliably in production depending on whether you need row-level Groovy filtering:

Option 1 (Standard CPI Splitter - zero memory spike):
Use a General Splitter or Iterating Splitter with Expression Type = Line Break and Enable Streaming = true, combined with a Gather or Aggregator/batching step, or send chunks into a JMS queue.

Option 2 (Streaming Reader inside Groovy):
Never call getBody(String.class). Read the InputStream with BufferedReader in UTF-8 and write output to a ByteArrayOutputStream or Piped/temp stream:

    import java.io.BufferedReader
    import java.io.InputStream
    import java.io.InputStreamReader
    import java.nio.charset.StandardCharsets

    def inputStream = message.getBody(InputStream.class)
    def reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))
    String line
    while ((line = reader.readLine()) != null) {
        // process line by line without loading full file
    }

If the target output itself is huge, split into JMS messages inside an Iterating Splitter so no single Camel exchange holds 85MB in heap.`,
      },
      {
        authorEmail: 'vikram.singh@seed.cpilancers.com',
        hoursAfterThread: 9,
        voterEmails: ['deepa.menon@seed.cpilancers.com'],
        body: `Also turn off MPL payload logging and trace on that iFlow in production! Even if your Groovy script streams cleanly, enabling Trace or attaching the full 85MB body to MPL will still exhaust worker memory.`,
      },
    ],
  },
  {
    key: 'xmlslurper-vs-graphical-mapping-50mb',
    categorySlug: 'cpi-development-groovy',
    authorEmail: 'karthik.rao@seed.cpilancers.com',
    title: 'XmlSlurper vs Graphical Message Mapping vs XSLT for 50MB S/4HANA payloads',
    body: `We have an outbound S/4HANA Material Master replication that occasionally bursts to 45–55MB XML. Right now it uses a standard Graphical Message Mapping, and during month-end it takes 40+ seconds and spikes worker memory.

Would rewriting it in XSLT 3.0 (streaming) or Groovy StAX/XmlSlurper make a meaningful difference, or should we push back on S/4HANA to reduce batch size?`,
    viewCount: 87,
    daysAgo: 9,
    voterEmails: [
      'rohan.deshmukh@seed.cpilancers.com',
      'deepa.menon@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'rohan.deshmukh@seed.cpilancers.com',
        hoursAfterThread: 3,
        isAccepted: true,
        voterEmails: [
          'karthik.rao@seed.cpilancers.com',
          'deepa.menon@seed.cpilancers.com',
        ],
        body: `First prize is always reducing the S/4HANA outbound packet size (e.g., 500–1,000 IDocs/records per call in BD64 / DRF replication model instead of 10,000).

If you cannot change the S/4HANA batch size:
1. Graphical Message Mapping builds a full DOM-like in-memory tree and is the heaviest on heap for 50MB+ XML.
2. XmlSlurper also parses the full tree into GPathResult nodes, so it is not true streaming either.
3. For real low-memory speed, use either XSLT 3.0 with Saxon streaming (xsl:mode streamable="yes") or Java StAX (XMLInputFactory / XMLStreamReader) inside Groovy, or split the inbound XML first with a streaming Iterating Splitter on the repeating record XPath.`,
      },
      {
        authorEmail: 'arjun.mehta@seed.cpilancers.com',
        hoursAfterThread: 10,
        voterEmails: ['rohan.deshmukh@seed.cpilancers.com'],
        body: `Streaming Iterating Splitter on the repeating <IDOC> or <Material> node + parallel/JMS processing is usually the cleanest win because it keeps your existing Graphical Mapping intact while capping each mapping execution to a few hundred KB.`,
      },
    ],
  },

  // =========================================================================
  // 2. PI/PO to Integration Suite (5 threads)
  // =========================================================================
  {
    key: 'sap-migration-assessment-300-interfaces',
    categorySlug: 'pipo-migration',
    authorEmail: 'priya.nair@seed.cpilancers.com',
    title: 'SAP Migration Assessment lessons from evaluating 320 dual-stack PO 7.5 interfaces',
    body: `We just ran the SAP Integration Suite Migration Assessment tool against a client's SAP PO 7.5 system ahead of their 2027 deadline. Total count came back as 320 ICOs, split roughly 55% "Ready to Migrate", 35% "Adjustment Required", and 10% "Manual Redesign".

For those who have already executed a 200+ interface migration in India/global rollouts, how accurate were those Assessment buckets in reality? Did "Ready to Migrate" actually deploy cleanly?`,
    viewCount: 141,
    daysAgo: 20,
    voterEmails: [
      'arjun.mehta@seed.cpilancers.com',
      'ananya.iyer@seed.cpilancers.com',
      'siddharth.joshi@seed.cpilancers.com',
      'meera.krishnan@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'ananya.iyer@seed.cpilancers.com',
        hoursAfterThread: 4,
        isAccepted: true,
        voterEmails: [
          'priya.nair@seed.cpilancers.com',
          'arjun.mehta@seed.cpilancers.com',
        ],
        body: `Great question. In our 280-interface PO 7.5 migration, the Migration Assessment was great for inventory and complexity sizing, but treat "Ready to Migrate" as "structure migrates cleanly", not "production-ready with zero work":

1. Error handling & alerting: PO Alert Rules do not auto-translate into CPI Exception Subprocesses. You still need to wire your standard error-handling pattern into every migrated iFlow.
2. Dynamic Configuration (ASMA): File names, directory paths, and custom SOAP headers stored in DynamicConfiguration need manual verification in Groovy or Content Modifier headers.
3. Retired interfaces: Roughly 20-25% of the 320 ICOs in older PO landscapes have had zero traffic in 12 months. Pull PO Message Monitor statistics first and decommission dead interfaces before estimating effort.`,
      },
      {
        authorEmail: 'siddharth.joshi@seed.cpilancers.com',
        hoursAfterThread: 8,
        voterEmails: ['priya.nair@seed.cpilancers.com'],
        body: `Seconding the traffic audit! On our last manufacturing client, 74 out of 260 ICOs had zero messages in the past year. Pruning those first saved almost 4 months of QA testing.`,
      },
      {
        authorEmail: 'meera.krishnan@seed.cpilancers.com',
        hoursAfterThread: 13,
        voterEmails: ['ananya.iyer@seed.cpilancers.com'],
        body: `Also check if any "Ready to Migrate" ICOs use RFC Lookup or JDBC Lookup inside Graphical Mapping. The mapping imports fine, but you have to reconfigure the externalized lookup parameters and Cloud Connector destinations in BTP.`,
      },
    ],
  },
  {
    key: 'edge-integration-cell-azure-aws-vs-cloud',
    categorySlug: 'pipo-migration',
    authorEmail: 'siddharth.joshi@seed.cpilancers.com',
    title: 'Edge Integration Cell (EIC) on Azure AKS vs standard Cloud Integration for plant A2A',
    body: `Our client has 6 manufacturing plants in Pune, Chennai, and Gujarat running MES, weighbridges, and local label printers that talk to S/4HANA over high-volume RFC/IDoc and local REST.

They are debating whether to deploy Edge Integration Cell (EIC) on Azure AKS / AWS EKS so plant traffic stays local, or route everything through BTP Cloud Integration + Cloud Connector. What is the operational reality of running EIC in 2026?`,
    viewCount: 112,
    daysAgo: 16,
    voterEmails: [
      'priya.nair@seed.cpilancers.com',
      'karthik.rao@seed.cpilancers.com',
      'vikram.singh@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'vikram.singh@seed.cpilancers.com',
        hoursAfterThread: 3,
        isAccepted: true,
        voterEmails: [
          'siddharth.joshi@seed.cpilancers.com',
          'priya.nair@seed.cpilancers.com',
        ],
        body: `If the client has a dedicated Kubernetes/platform team (AKS/EKS) and strict shop-floor latency or internet-outage resilience requirements (e.g., weighbridges and label printing must keep running even if WAN drops), EIC makes strong architectural sense.

However, do not underestimate the operational footprint:
1. You own Kubernetes cluster upgrades, ingress/TLS certificates, node scaling, and persistent storage (PostgreSQL/Redis equivalents depending on EIC profile).
2. Not every Cloud Integration adapter is supported identically on EIC—verify your exact adapter list (especially third-party adapters and B2B/AS2) against the current SAP Note before committing.
3. For pure S/4HANA + Cloud SaaS integrations without strict local-loop latency, BTP Cloud Integration + HA Cloud Connector is dramatically simpler to operate.`,
      },
      {
        authorEmail: 'karthik.rao@seed.cpilancers.com',
        hoursAfterThread: 9,
        voterEmails: ['siddharth.joshi@seed.cpilancers.com'],
        body: `Also verify network topology: if S/4HANA itself is hosted on RISE with SAP in the cloud while the plants are on-prem, putting EIC on-prem still requires WAN connectivity to reach S/4HANA anyway. Map where the endpoints physically live before sizing EIC.`,
      },
    ],
  },
  {
    key: 'migrating-ccbpm-and-java-mapping-udfs',
    categorySlug: 'pipo-migration',
    authorEmail: 'rohan.deshmukh@seed.cpilancers.com',
    title: 'Best patterns for migrating legacy ccBPM and Java Mapping UDFs to CPI',
    body: `We have 14 legacy ccBPM / NW BPM scenarios (mostly collect-and-merge patterns waiting on 2 IDoc types + 1 REST lookup before posting to S/4HANA) and about 30 heavy Java Mappings using DOM/SAX.

In CPI, should we try to replicate the exact BPM state machine using Aggregator + JMS + Data Store, or push correlation back to S/4HANA / Event Mesh?`,
    viewCount: 78,
    daysAgo: 13,
    voterEmails: [
      'ananya.iyer@seed.cpilancers.com',
      'arjun.mehta@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'arjun.mehta@seed.cpilancers.com',
        hoursAfterThread: 4,
        isAccepted: true,
        voterEmails: [
          'rohan.deshmukh@seed.cpilancers.com',
          'ananya.iyer@seed.cpilancers.com',
        ],
        body: `Avoid rebuilding complex 10-step BPM state machines in CPI if you can simplify the trigger.

Pattern breakdown that worked for us:
1. Simple N-to-1 batch merge (collect messages for 15 minutes, then send one file): Use CPI Aggregator + JMS queue with completion condition.
2. Correlation across two different systems (wait for IDoc A and REST event B): Either store event A in Data Store / JMS and poll/correlate on key, OR trigger the enrichment lookup on-demand via Request Reply when the primary event arrives—that removes stateful waiting completely.
3. Java Mappings: Graphical mappings with imported Java archives work in CPI if they implement AbstractTransformation / StreamTransformation without PI-specific container APIs, but rewriting small DOM mappings into clean Groovy or XSLT is usually faster to maintain long term.`,
      },
      {
        authorEmail: 'deepa.menon@seed.cpilancers.com',
        hoursAfterThread: 11,
        voterEmails: ['rohan.deshmukh@seed.cpilancers.com'],
        body: `Watch out for CPI Aggregator limits when message volumes are high—Data Store persistence under heavy parallel aggregation can hit DB lock contention. Test with realistic peak concurrency early in QA.`,
      },
    ],
  },
  {
    key: 'figaf-vs-int4-vs-manual-regression-2027',
    categorySlug: 'pipo-migration',
    authorEmail: 'ananya.iyer@seed.cpilancers.com',
    title: 'Figaf vs Int4 Suite vs manual regression testing for PO to CPI cutovers',
    body: `Our client is budgeting for a 180-interface PO 7.5 to Integration Suite migration over 9 months. Business SMEs have very limited bandwidth for UAT payload creation.

For teams who used Figaf or Int4 Suite (or built a custom Postman/Newman harness), at what interface count does automated payload comparison pay for itself?`,
    viewCount: 97,
    daysAgo: 10,
    voterEmails: [
      'priya.nair@seed.cpilancers.com',
      'siddharth.joshi@seed.cpilancers.com',
      'meera.krishnan@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'priya.nair@seed.cpilancers.com',
        hoursAfterThread: 5,
        voterEmails: ['ananya.iyer@seed.cpilancers.com'],
        body: `Above ~80-100 interfaces, automated payload capture and comparison (Int4 or Figaf) pays for itself purely in reduced functional consultant UAT time. You record production PO input/output pairs, replay the exact input into CPI QA, and diff the generated XML/JSON while ignoring timestamps and generated GUIDs.

Under 40-50 interfaces, a well-organized Postman/Newman collection + CPI simulation/test suite is usually sufficient without third-party licensing overhead.`,
      },
      {
        authorEmail: 'siddharth.joshi@seed.cpilancers.com',
        hoursAfterThread: 11,
        voterEmails: ['ananya.iyer@seed.cpilancers.com', 'priya.nair@seed.cpilancers.com'],
        body: `Make sure whichever approach you pick also tests IDoc/RFC outbound edge cases and negative error paths, not just happy-path mapping outputs. Mapping diffs catch 80% of bugs, while adapter/header/auth testing catches the remaining 20% that break go-live.`,
      },
    ],
  },
  {
    key: 'value-mapping-ico-routing-migration',
    categorySlug: 'pipo-migration',
    authorEmail: 'meera.krishnan@seed.cpilancers.com',
    title: 'Handling multi-receiver ICO routing and Value Mapping tables after PO migration',
    body: `In SAP PO 7.5 we had a single ICO with XPath-based Receiver Determination routing to 4 different downstream receivers, plus 12 Value Mapping groups maintained by support teams in Integration Directory.

In Integration Suite, what is the cleanest way to structure multi-receiver routing and allow non-developer support users to update Value Mappings safely?`,
    viewCount: 68,
    daysAgo: 6,
    voterEmails: ['karthik.rao@seed.cpilancers.com', 'sneha.kulkarni@seed.cpilancers.com'],
    replies: [
      {
        authorEmail: 'karthik.rao@seed.cpilancers.com',
        hoursAfterThread: 3,
        isAccepted: true,
        voterEmails: ['meera.krishnan@seed.cpilancers.com'],
        body: `For multi-receiver routing:
Use a Router step (or ProcessDirect calls to modular receiver-specific iFlows). Putting all 4 receiver adapters inside one giant iFlow makes transport and troubleshooting painful; a lightweight dispatcher iFlow + ProcessDirect to 4 small receiver iFlows is much cleaner.

For Value Mapping updates by support teams:
Do not give support teams Design-time edit access to Integration Packages. Instead, either:
1. Expose the standard Integration Suite Value Mapping OData API via a lightweight UI/script or Postman collection with strict role permissions, OR
2. Keep frequently changing business cross-reference tables in S/4HANA custom TVARVC/Z-tables or SAP Build/BTP lookup if business users edit them daily.`,
      },
      {
        authorEmail: 'sneha.kulkarni@seed.cpilancers.com',
        hoursAfterThread: 8,
        voterEmails: ['meera.krishnan@seed.cpilancers.com'],
        body: `Note on migrating PO Value Mappings: export them as CSV from PO Integration Directory, transform to the CPI Value Mapping CSV format (SourceAgency, SourceIdentifier, TargetAgency, TargetIdentifier), and import directly into a dedicated Value Mapping artifact so it can be deployed independently of iFlows.`,
      },
    ],
  },

  // =========================================================================
  // 3. Adapters, S/4HANA & Security (5 threads)
  // =========================================================================
  {
    key: 'oauth2-saml-bearer-principal-propagation',
    categorySlug: 'adapters-s4hana-security',
    authorEmail: 'ananya.iyer@seed.cpilancers.com',
    title: 'Configuring OAuth2 SAML Bearer Assertion to SuccessFactors & S/4HANA cleanly',
    body: `We need to set up OAuth2 SAML Bearer Assertion from CPI to SuccessFactors OData APIs (and Principal Propagation via Cloud Connector to S/4HANA on-prem) so audit logs show the actual business user rather than a generic technical user.

Every time we test the SuccessFactors OAuth2 SAML Bearer credential in BTP Security Material, we hit "invalid_grant" or "Unable to verify SAML assertion signature". Which certificate and user ID mapping mismatches cause this most often?`,
    viewCount: 129,
    daysAgo: 18,
    voterEmails: [
      'arjun.mehta@seed.cpilancers.com',
      'vikram.singh@seed.cpilancers.com',
      'deepa.menon@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'vikram.singh@seed.cpilancers.com',
        hoursAfterThread: 2,
        isAccepted: true,
        voterEmails: [
          'ananya.iyer@seed.cpilancers.com',
          'arjun.mehta@seed.cpilancers.com',
        ],
        body: `90% of SuccessFactors OAuth2 SAML Bearer failures come down to one of these four mismatches:

1. X.509 Certificate in Manage OAuth2 Client Applications:
Download the exact public key certificate from CPI's Keystore (or the subaccount X.509 keypair you selected in the OAuth2 SAML Bearer Assertion credential) and paste the Base64 body without BEGIN/END CERTIFICATE headers into SuccessFactors OAuth2 Client registration.

2. Token Endpoint & Company ID:
Ensure Token Service URL matches your exact SF data center (e.g., apiXX.sapsf.com/oauth/token) and the Company ID parameter matches case-sensitively.

3. User Identifier (NameID) mismatch:
Check whether SuccessFactors expects User ID, Username, or Email in the SAML NameID, and verify the CPI "User ID" field (or incoming principal) matches an active SF user.

4. Clock skew / Audience:
Verify the Audience URL in the credential matches the SuccessFactors API server URL, not the UI login URL.`,
      },
      {
        authorEmail: 'deepa.menon@seed.cpilancers.com',
        hoursAfterThread: 7,
        voterEmails: ['ananya.iyer@seed.cpilancers.com'],
        body: `For the S/4HANA on-prem Principal Propagation side via Cloud Connector: remember that Cloud Connector generates short-lived X.509 certificates for the backend, so S/4HANA needs the Cloud Connector CA cert in STRUST plus rule-based mapping in CERTRULE, and BTP Destination must use Authentication = PrincipalPropagation.`,
      },
    ],
  },
  {
    key: 'http-403-csrf-token-s4hana-odata-cloud-connector',
    categorySlug: 'adapters-s4hana-security',
    authorEmail: 'karthik.rao@seed.cpilancers.com',
    title: 'Solving HTTP 403 CSRF token validation failed on S/4HANA OData V2/V4 POST/PATCH',
    body: `Our CPI iFlow calls an S/4HANA OData V2 API (API_SALES_ORDER_SRV) via Cloud Connector using Basic Auth. GET calls work fine, but POST and PATCH fail intermittently with HTTP 403: "CSRF token validation failed", even though "CSRF Protected" is checked in the OData receiver adapter!

Why does the adapter's built-in CSRF handling still fail on some calls?`,
    viewCount: 144,
    daysAgo: 14,
    voterEmails: [
      'sneha.kulkarni@seed.cpilancers.com',
      'rohan.deshmukh@seed.cpilancers.com',
      'priya.nair@seed.cpilancers.com',
      'arjun.mehta@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'rohan.deshmukh@seed.cpilancers.com',
        hoursAfterThread: 1,
        isAccepted: true,
        voterEmails: [
          'karthik.rao@seed.cpilancers.com',
          'sneha.kulkarni@seed.cpilancers.com',
          'arjun.mehta@seed.cpilancers.com',
        ],
        body: `When CSRF Protected is enabled, CPI fetches a token via HEAD/GET and relies on the SAP_SESSIONID_* and sap-XSRF_* cookies returned by S/4HANA (or Web Dispatcher).

Intermittent 403s happen for two common reasons:
1. Reuse Connection / Session Cookie mismatch behind a Load Balancer (Web Dispatcher): If the GET token fetch hits S/4HANA app server 1 and the POST hits app server 2 without sticky sessions, the CSRF token is rejected. Check "Reuse Connection" or configure Web Dispatcher sticky sessions.
2. Stripped Cookie header in CPI: If your iFlow sets CamelHttpHeaders or modifies headers before the OData call, ensure "Cookie" is NOT blocked or overwritten, and verify Allowed Headers in Runtime Configuration if coming from an upstream Request Reply.

Workaround if Web Dispatcher stickiness cannot be fixed immediately: set "Reuse Connection" off and fetch X-CSRF-Token + Cookie explicitly in a Request Reply (HTTP GET with X-CSRF-Token: Fetch), extract Set-Cookie + x-csrf-token in Groovy, and pass both into the POST call.`,
      },
      {
        authorEmail: 'priya.nair@seed.cpilancers.com',
        hoursAfterThread: 5,
        voterEmails: ['karthik.rao@seed.cpilancers.com'],
        body: `Also check if the OData V4 receiver adapter is being used against an S/4HANA Gateway with ICM session cookies disabled—for OData V4, verify ICF node settings in SICF and ensure x-csrf-token is not stripped by an intermediate reverse proxy.`,
      },
    ],
  },
  {
    key: 'sftp-ssh-key-rotation-algorithm-negotiation-fail',
    categorySlug: 'adapters-s4hana-security',
    authorEmail: 'deepa.menon@seed.cpilancers.com',
    title: 'SFTP adapter "Algorithm negotiation fail" after bank partner SSH key rotation',
    body: `A bank partner upgraded their SFTP server overnight and disabled older SHA-1 key exchange and RSA ssh-rsa algorithms. Now our CPI SFTP sender/receiver channels fail with:
com.jcraft.jsch.JSchException: Algorithm negotiation fail

How do we update CPI's known_hosts and SSH algorithms cleanly without downtime across multiple iFlows?`,
    viewCount: 103,
    daysAgo: 11,
    voterEmails: [
      'vikram.singh@seed.cpilancers.com',
      'ananya.iyer@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'vikram.singh@seed.cpilancers.com',
        hoursAfterThread: 2,
        isAccepted: true,
        voterEmails: [
          'deepa.menon@seed.cpilancers.com',
          'ananya.iyer@seed.cpilancers.com',
        ],
        body: `Two things happen when banks harden their SFTP servers in 2026:

1. Host Key Algorithm (known_hosts):
If the bank switched from ssh-rsa to ecdsa-sha2-nistp256 or ssh-ed25519, run the CPI Connectivity Test (Monitor -> Manage Security -> Connectivity Tests -> SFTP) to fetch the new host key, then append the new entry to your known_hosts file in Security Material (keep the old entry temporarily until cutover finishes, then remove it).

2. Client Auth / KEX Algorithms:
If you use Public Key authentication with an older RSA key, CPI's updated JSch library supports rsa-sha2-256 and rsa-sha2-512, or you can generate a new ECDSA/Ed25519 keypair in BTP Keystore and share the public key with the bank. Also verify "Use Fast Exists Check" and check SAP Note for the latest supported KEX list if the bank restricts to curve25519-sha256 only.`,
      },
      {
        authorEmail: 'siddharth.joshi@seed.cpilancers.com',
        hoursAfterThread: 7,
        voterEmails: ['deepa.menon@seed.cpilancers.com'],
        body: `Always use the Connectivity Test tool in CPI Monitor first—it prints the exact offered server_host_key, kex, and cipher lists in the trace so you do not have to guess which algorithm mismatched.`,
      },
    ],
  },
  {
    key: 'idoc-eoio-duplicate-checks-jms-queues',
    categorySlug: 'adapters-s4hana-security',
    authorEmail: 'siddharth.joshi@seed.cpilancers.com',
    title: 'Guaranteeing IDoc EOIO ordering and duplicate prevention using JMS queues',
    body: `We are receiving MATMAS and ORDERS IDocs from S/4HANA into CPI. The downstream warehouse system requires strict sequence per Material/Order ID (EOIO) and cannot tolerate duplicate IDoc numbers if S/4HANA tRFC retries after a transient timeout.

What is the recommended CPI pattern using JMS queues and Data Store for sequence + deduplication?`,
    viewCount: 89,
    daysAgo: 8,
    voterEmails: [
      'karthik.rao@seed.cpilancers.com',
      'rohan.deshmukh@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'karthik.rao@seed.cpilancers.com',
        hoursAfterThread: 3,
        isAccepted: true,
        voterEmails: [
          'siddharth.joshi@seed.cpilancers.com',
          'rohan.deshmukh@seed.cpilancers.com',
        ],
        body: `Note first: CPI JMS queues themselves do NOT guarantee strict global FIFO/EOIO ordering across multiple parallel consumers (unless max consumers = 1, which still has edge cases on retries).

Here is the most reliable production setup:
1. Decouple fast: Inbound IDoc iFlow receives the IDoc, validates basic structure, writes to a JMS queue (with Access Type = Exclusive if strict single-consumer ordering is needed), and immediately returns HTTP 200 to S/4HANA so tRFC never times out and duplicates.
2. Deduplication: In the JMS consumer iFlow, extract DOCNUM (IDoc Number) and check an Idempotent Process Call (with SapMessageId or DOCNUM as the idempotency key in Data Store, retention e.g. 7 days). If already processed, skip cleanly.
3. True EOIO: If strict ordering per object key is mandatory, consider SAP Event Mesh / Advanced Event Mesh partitioned queues, or check sequence/timestamp in the target system.`,
      },
      {
        authorEmail: 'arjun.mehta@seed.cpilancers.com',
        hoursAfterThread: 9,
        voterEmails: ['siddharth.joshi@seed.cpilancers.com'],
        body: `The Idempotent Process Call step in CPI is built specifically for this—pair it with the IDoc's DOCNUM (or SapMessageId) so even if S/4HANA tRFC re-sends the exact IDoc, the consumer drops the duplicate before calling the warehouse.`,
      },
    ],
  },
  {
    key: 'api-management-rate-limiting-spike-arrest',
    categorySlug: 'adapters-s4hana-security',
    authorEmail: 'vikram.singh@seed.cpilancers.com',
    title: 'Putting SAP API Management Rate Limiting & Spike Arrest in front of CPI HTTPS',
    body: `External e-commerce partners are calling our CPI HTTPS endpoints directly using OAuth2 Client Credentials. During flash sales, a burst of 400 req/sec overwhelmed our CPI worker threads and delayed internal S/4HANA interfaces.

How should we configure SAP API Management (APIM) Spike Arrest + Quota policies in front of CPI, and should we lock CPI's HTTPS sender with mTLS or APIM-only client certs?`,
    viewCount: 82,
    daysAgo: 5,
    voterEmails: [
      'ananya.iyer@seed.cpilancers.com',
      'priya.nair@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'ananya.iyer@seed.cpilancers.com',
        hoursAfterThread: 2,
        isAccepted: true,
        voterEmails: ['vikram.singh@seed.cpilancers.com'],
        body: `Yes, always put APIM in front of external partner-facing CPI HTTPS endpoints.

Recommended setup:
1. Lock down CPI HTTPS sender: Configure the CPI HTTPS sender with Client Certificate Authentication (mTLS) trusting ONLY the APIM outbound client certificate (plus optional IP allowlist if applicable), so partners cannot bypass APIM and hit the CPI runtime URL directly.
2. Spike Arrest policy in APIM PreFlow: Set e.g. 60pm or 10ps depending on your CPI worker sizing to smooth sudden micro-bursts before they hit CPI.
3. Quota policy per API Key / Product: Enforce daily/hourly quotas per partner and return standard HTTP 429 with Retry-After header so partner systems back off gracefully.
4. For truly asynchronous bursts (like order creation), have CPI push straight to a JMS queue and return 202 Accepted.`,
      },
      {
        authorEmail: 'meera.krishnan@seed.cpilancers.com',
        hoursAfterThread: 6,
        voterEmails: ['vikram.singh@seed.cpilancers.com'],
        body: `Don't forget to increase or tune the APIM TargetEndpoint timeout to match synchronous CPI processing time, and strip any internal CPI headers in APIM PostFlow before returning responses to external partners.`,
      },
    ],
  },

  // =========================================================================
  // 4. Error Handling & Operations (5 threads)
  // =========================================================================
  {
    key: 'centralized-error-handling-iflow-processdirect',
    categorySlug: 'error-handling-ops',
    authorEmail: 'meera.krishnan@seed.cpilancers.com',
    title: 'Designing a reusable centralized error-handling iFlow with Exception Subprocess',
    body: `We have 60+ iFlows and right now each one has slightly different error logging and hardcoded email addresses. We want to standardize on a single reusable Exception Handler iFlow invoked via ProcessDirect.

What properties/headers do you pass from the calling iFlow's Exception Subprocess, and how do you format timestamps cleanly for an India-based support team (IST) plus global stakeholders (UTC)?`,
    viewCount: 136,
    daysAgo: 18,
    voterEmails: [
      'arjun.mehta@seed.cpilancers.com',
      'priya.nair@seed.cpilancers.com',
      'deepa.menon@seed.cpilancers.com',
      'sneha.kulkarni@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'arjun.mehta@seed.cpilancers.com',
        hoursAfterThread: 2,
        isAccepted: true,
        voterEmails: [
          'meera.krishnan@seed.cpilancers.com',
          'priya.nair@seed.cpilancers.com',
        ],
        body: `Here is the exact pattern we deploy across enterprise tenants:

1. In every business iFlow's Exception Subprocess:
Capture CamelExceptionCaught, CamelFailureEndpoint, SAP_MessageProcessingLogID, SAP_IntegrationFlowName (via header/property or externalized param), and your custom correlation ID (e.g. OrderNumber / IDocNumber), then call ProcessDirect -> /common/error-handler.

2. Inside the Central Error Handler iFlow:
Use a Groovy script to build a clean JSON/HTML alert payload containing:
- Tenant ID & Environment (DEV/QA/PRD)
- iFlow Name & MPL Correlation Link (direct URL to Monitor -> Message Processing)
- Error Message & HTTP Status Code (from CamelHttpResponseCode if HttpOperationFailedException)
- Both IST and UTC timestamps:

    import java.time.ZonedDateTime
    import java.time.ZoneId
    import java.time.format.DateTimeFormatter

    def fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z")
    def nowUtc = ZonedDateTime.now(ZoneId.of("UTC")).format(fmt)
    def nowIst = ZonedDateTime.now(ZoneId.of("Asia/Kolkata")).format(fmt)

3. End the Exception Subprocess in the calling iFlow with Error End Event (if you want the MPL status to show Failed for retry/monitoring) or Message End Event if handled gracefully.`,
      },
      {
        authorEmail: 'deepa.menon@seed.cpilancers.com',
        hoursAfterThread: 6,
        voterEmails: ['meera.krishnan@seed.cpilancers.com'],
        body: `Also include a Value Mapping lookup inside the Central Error Handler keyed by iFlow Name or Functional Area! That way Finance errors email finance-support, Supply Chain errors email scm-support, and you never have to redeploy 60 iFlows when support team emails change.`,
      },
    ],
  },
  {
    key: 'jms-dead-letter-queue-exponential-backoff',
    categorySlug: 'error-handling-ops',
    authorEmail: 'rohan.deshmukh@seed.cpilancers.com',
    title: 'Configuring JMS exponential backoff retries and Dead-Letter Queues properly',
    body: `We use JMS queues for async S/4HANA -> Third-Party REST calls. When the third-party API goes down for 2 hours during maintenance, CPI keeps retrying every 1 minute, hits max retry limit, and moves messages to the Dead-Letter Queue (DLQ) before maintenance ends.

What retry interval + exponential backoff settings work well on standard BTP JMS brokers without exhausting queue storage?`,
    viewCount: 91,
    daysAgo: 14,
    voterEmails: [
      'karthik.rao@seed.cpilancers.com',
      'vikram.singh@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'karthik.rao@seed.cpilancers.com',
        hoursAfterThread: 3,
        isAccepted: true,
        voterEmails: [
          'rohan.deshmukh@seed.cpilancers.com',
          'vikram.singh@seed.cpilancers.com',
        ],
        body: `Enable Exponential Backoff on the JMS Sender adapter!

A solid default for 2-4 hour partner maintenance windows:
- Retry Interval: 5 min (or 2 min)
- Exponential Backoff: Checked (doubles each retry: 5m -> 10m -> 20m -> 40m -> 60m)
- Maximum Retry Interval: 60 min
- Dead-Letter Queue: Checked, with Retention Threshold matching your SLA (e.g., 7 to 14 days, NOT 90 days if payloads are large).

Also build a simple manual "DLQ Replay" iFlow or alert when DLQ depth > 0 in Cloud ALM / Alert Notification Service so failed messages are never forgotten silently.`,
      },
      {
        authorEmail: 'siddharth.joshi@seed.cpilancers.com',
        hoursAfterThread: 9,
        voterEmails: ['rohan.deshmukh@seed.cpilancers.com'],
        body: `Watch out for permanent 4xx errors (like HTTP 400 Bad Request / invalid schema) inside a JMS retry loop. If the payload itself is bad, retrying 10 times over 6 hours wastes resources. In your Exception Subprocess, inspect the HTTP status code: for 400/401/422, alert immediately and move to an error store or end cleanly without triggering JMS retry; only re-throw for 429/5xx/network timeouts.`,
      },
    ],
  },
  {
    key: 'controlling-mpl-attachment-bloat',
    categorySlug: 'error-handling-ops',
    authorEmail: 'sneha.kulkarni@seed.cpilancers.com',
    title: 'Controlling MPL attachment bloat on high-volume CPI tenants',
    body: `Our monitoring team noticed MPL storage growing rapidly because several iFlows call messageLog.addAttachmentAsString() on every incoming and outgoing payload—even when the message succeeds.

What is your team's production policy on MPL attachments and log levels?`,
    viewCount: 74,
    daysAgo: 11,
    voterEmails: [
      'arjun.mehta@seed.cpilancers.com',
      'meera.krishnan@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'arjun.mehta@seed.cpilancers.com',
        hoursAfterThread: 2,
        isAccepted: true,
        voterEmails: [
          'sneha.kulkarni@seed.cpilancers.com',
          'meera.krishnan@seed.cpilancers.com',
        ],
        body: `Never log full payloads as MPL attachments unconditionally in production! It degrades throughput, balloons DB storage, and often violates PII/security compliance.

Our standard policy:
1. Externalize a boolean parameter like ENABLE_PAYLOAD_LOG = false across iFlows. Set it to true only temporarily for a specific iFlow during active UAT or incident triage.
2. In production, always log lightweight custom header properties (messageLog.addCustomHeaderProperty("OrderID", orderId)) so messages remain searchable in Monitor without storing 500KB XMLs.
3. Only attach the payload inside the Exception Subprocess on actual failure (and mask sensitive tokens/PII fields if applicable).`,
      },
      {
        authorEmail: 'priya.nair@seed.cpilancers.com',
        hoursAfterThread: 7,
        voterEmails: ['sneha.kulkarni@seed.cpilancers.com'],
        body: `Custom Header Properties are a lifesaver. Once support teams can search directly by IDoc number, Sales Order, or Delivery ID in the Monitor search bar, nobody asks for full-payload Info logging anymore.`,
      },
    ],
  },
  {
    key: 'sap-cloud-alm-btp-alert-notification',
    categorySlug: 'error-handling-ops',
    authorEmail: 'deepa.menon@seed.cpilancers.com',
    title: 'SAP Cloud ALM vs BTP Alert Notification Service for CPI proactive monitoring',
    body: `We are setting up proactive alerting for our Integration Suite tenant—failed iFlows, expiring keystore certificates (30/15/7 days), and JMS queue depth thresholds.

Should we configure BTP Alert Notification Service directly to Microsoft Teams / Slack / ServiceNow, or route everything through SAP Cloud ALM Integration & Exception Monitoring?`,
    viewCount: 83,
    daysAgo: 7,
    voterEmails: ['vikram.singh@seed.cpilancers.com', 'ananya.iyer@seed.cpilancers.com'],
    replies: [
      {
        authorEmail: 'ananya.iyer@seed.cpilancers.com',
        hoursAfterThread: 4,
        voterEmails: ['deepa.menon@seed.cpilancers.com'],
        body: `If the client already runs SAP Cloud ALM for S/4HANA monitoring, definitely connect Integration Suite to Cloud ALM—you get end-to-end correlation across S/4HANA IDocs and CPI iFlows plus built-in ticket creation for ServiceNow/Jira.

Even with Cloud ALM, we still keep BTP Alert Notification Service active for platform-level alerts like Keystore certificate expiry warnings and JMS broker capacity limits, routed straight to a dedicated MS Teams / Slack ops channel.`,
      },
      {
        authorEmail: 'vikram.singh@seed.cpilancers.com',
        hoursAfterThread: 9,
        voterEmails: ['deepa.menon@seed.cpilancers.com'],
        body: `Pro tip: test the certificate expiry alert rule in DEV with a dummy self-signed cert expiring in 10 days. Too many teams set up Alert Notification Service and never verify the webhook payload reaches Teams/ServiceNow until a production cert actually expires.`,
      },
    ],
  },
  {
    key: 'cicd-ctms-vs-github-actions-flashpipe',
    categorySlug: 'error-handling-ops',
    authorEmail: 'karthik.rao@seed.cpilancers.com',
    title: 'CI/CD for Integration Suite: SAP cTMS vs CTS+ vs GitHub Actions + FlashPipe',
    body: `We are moving away from manual export/import of iFlow ZIPs between DEV, QA, and PRD. Our SAP Basis team prefers SAP Cloud Transport Management (cTMS), while our integration devs want Git-based PR reviews with FlashPipe / Piper.

Can we combine GitHub PR reviews with cTMS for audit-compliant production approvals?`,
    viewCount: 105,
    daysAgo: 4,
    voterEmails: [
      'arjun.mehta@seed.cpilancers.com',
      'rohan.deshmukh@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'rohan.deshmukh@seed.cpilancers.com',
        hoursAfterThread: 3,
        isAccepted: true,
        voterEmails: ['karthik.rao@seed.cpilancers.com', 'arjun.mehta@seed.cpilancers.com'],
        body: `Yes, combining Git + cTMS is actually the sweet spot for enterprise SAP governance:

1. Developers work in DEV, then sync/export iFlow source into GitHub (via FlashPipe or Piper) to run PR code reviews, Groovy lint/upgrade checks, and automated regression tests.
2. On merge to main, the pipeline builds/uploads the MTAR or triggers cTMS transport import into QA and creates the transport request for PRD.
3. Basis / Change Management approves the PRD import inside cTMS (or ServiceNow ChaRM integration), preserving full audit trails without manual ZIP handling.`,
      },
      {
        authorEmail: 'arjun.mehta@seed.cpilancers.com',
        hoursAfterThread: 8,
        voterEmails: ['karthik.rao@seed.cpilancers.com'],
        body: `Whatever you choose, strictly externalize all hostnames, credentials, and receiver addresses before transporting! Nothing breaks a clean CI/CD pipeline faster than hardcoded DEV URLs inside an iFlow.`,
      },
    ],
  },

  // =========================================================================
  // 5. Careers & Projects (India) (5 threads)
  // =========================================================================
  {
    key: 'welcome-to-cpi-lancers-introduce-yourself',
    categorySlug: 'careers-projects-india',
    authorEmail: 'priya.nair@seed.cpilancers.com',
    title: 'Welcome to CPI Lancers — introduce yourself and your SAP Integration stack',
    body: `Welcome to the CPI Lancers Community Forum!

This space is built specifically for SAP Cloud Integration (CPI), Integration Suite, PI/PO, API Management, and Event Mesh practitioners across India and global enterprise teams.

Drop a quick intro below:
1. Your current city / time zone and years of SAP experience
2. Your core stack (CPI, PI/PO 7.5, S/4HANA, SuccessFactors, Ariba, B2B/EDI)
3. One integration challenge or migration project you are working on right now

Looking forward to learning and building together.`,
    isPinned: true,
    viewCount: 145,
    daysAgo: 21,
    voterEmails: [
      'arjun.mehta@seed.cpilancers.com',
      'karthik.rao@seed.cpilancers.com',
      'sneha.kulkarni@seed.cpilancers.com',
      'rohan.deshmukh@seed.cpilancers.com',
      'ananya.iyer@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'arjun.mehta@seed.cpilancers.com',
        hoursAfterThread: 2,
        voterEmails: ['priya.nair@seed.cpilancers.com', 'karthik.rao@seed.cpilancers.com'],
        body: `Hi everyone! Arjun here from Bengaluru (IST). 8 years in SAP Integration—started on PI 7.31/PO 7.5 and now mostly leading S/4HANA + SuccessFactors Integration Suite builds and Groovy 4 readiness reviews.`,
      },
      {
        authorEmail: 'sneha.kulkarni@seed.cpilancers.com',
        hoursAfterThread: 5,
        voterEmails: ['priya.nair@seed.cpilancers.com'],
        body: `Sneha from Pune! 6 years across SAP PO, CPI, and B2B EDI (AS2/EDIFACT/X12). Currently working on a large 3PL warehouse integration using SFTP, JMS, and OData V4.`,
      },
      {
        authorEmail: 'ananya.iyer@seed.cpilancers.com',
        hoursAfterThread: 9,
        voterEmails: ['priya.nair@seed.cpilancers.com', 'arjun.mehta@seed.cpilancers.com'],
        body: `Ananya from Chennai, 10 years in SAP middleware and Integration Architecture. Focused right now on helping manufacturing clients assess 2027 PO-to-Integration Suite roadmaps and BTP API Management governance.`,
      },
    ],
  },
  {
    key: 'sap-integration-suite-certification-prep',
    categorySlug: 'careers-projects-india',
    authorEmail: 'sneha.kulkarni@seed.cpilancers.com',
    title: 'Preparing for C_CPI_2404 / SAP Integration Suite certification in 2026 — study notes',
    body: `Planning to take the SAP Certified Associate - Integration Developer (C_CPI_2404 / Integration Suite) exam next month.

For those who cleared it recently, how heavily weighted are API Management, Event Mesh, and Integration Advisor compared to core Cloud Integration iFlow & security questions?`,
    viewCount: 121,
    daysAgo: 15,
    voterEmails: [
      'deepa.menon@seed.cpilancers.com',
      'meera.krishnan@seed.cpilancers.com',
      'siddharth.joshi@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'meera.krishnan@seed.cpilancers.com',
        hoursAfterThread: 3,
        isAccepted: true,
        voterEmails: ['sneha.kulkarni@seed.cpilancers.com', 'deepa.menon@seed.cpilancers.com'],
        body: `Cleared it two months ago. Core Cloud Integration (iFlow steps, Camel message model, Content Modifier vs Script, security/OAuth/mTLS, exception handling) is still ~55-60% of the exam, while API Management + Event Mesh + Open Connectors/Integration Advisor make up the remaining ~40%.

Key topics not to skip:
1. Exchange properties vs Headers vs Body scope across ProcessDirect and Splitter boundaries.
2. API Management policy flow order (ProxyEndpoint PreFlow/PostFlow vs TargetEndpoint).
3. SAP BTP trial hands-on: actually building an API Proxy and a basic iFlow makes the scenario questions trivial.`,
      },
      {
        authorEmail: 'siddharth.joshi@seed.cpilancers.com',
        hoursAfterThread: 8,
        voterEmails: ['sneha.kulkarni@seed.cpilancers.com'],
        body: `SAP Learning Hub's official Integration Suite learning journey practice questions match the real exam style closely. Pay extra attention to the difference between Content Enricher, Request Reply, and Poll Enrich.`,
      },
    ],
  },
  {
    key: 'india-sap-cpi-freelance-rates-2026',
    categorySlug: 'careers-projects-india',
    authorEmail: 'rohan.deshmukh@seed.cpilancers.com',
    title: 'Realistic 2026 India consulting hourly & daily rates (INR) for 5-10 YOE SAP CPI',
    body: `I am transitioning from a full-time lead role in Hyderabad (7 YOE in PO 7.5 + CPI + S/4HANA) into independent SAP Integration consulting for Indian enterprises and GCCs.

What are realistic 2026 billing benchmarks in INR for:
1. Mid-senior CPI developer (4-6 YOE)
2. Senior Integration Suite / Migration specialist (7-10 YOE)
3. Fractional Integration Architect (10+ YOE)`,
    viewCount: 142,
    daysAgo: 12,
    voterEmails: [
      'arjun.mehta@seed.cpilancers.com',
      'priya.nair@seed.cpilancers.com',
      'vikram.singh@seed.cpilancers.com',
      'karthik.rao@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'vikram.singh@seed.cpilancers.com',
        hoursAfterThread: 3,
        isAccepted: true,
        voterEmails: [
          'rohan.deshmukh@seed.cpilancers.com',
          'arjun.mehta@seed.cpilancers.com',
        ],
        body: `Direct B2B rates in India vary by whether you contract directly with the enterprise/GCC vs through an implementation partner, and whether you handle GST invoicing:

1. 4-6 YOE (CPI + Groovy + standard OData/SFTP): Typically ₹1,800 - ₹2,800/hr (approx. ₹14,000 - ₹22,000/day).
2. 7-10 YOE (PO-to-CPI migration, S/4HANA Principal Propagation, B2B/JMS): Typically ₹2,800 - ₹4,500/hr (approx. ₹22,000 - ₹36,000/day).
3. 10+ YOE Architect (EIC, multi-country rollouts, APIM governance): Typically ₹4,500 - ₹6,500+/hr depending on specialization and direct enterprise relationship.

Always clarify whether rates are exclusive of 18% GST and confirm payment terms (Net 15 or Net 30) upfront.`,
      },
      {
        authorEmail: 'priya.nair@seed.cpilancers.com',
        hoursAfterThread: 6,
        voterEmails: ['rohan.deshmukh@seed.cpilancers.com'],
        body: `Good breakdown. For EU/US clients working overlap hours from India (IST afternoon/evening), senior independent specialists often command the upper end of those bands—or higher—when bringing niche skills like Ariba CIG, SuccessFactors EC Payroll, or B2B Integration Advisor.`,
      },
    ],
  },
  {
    key: 'abap-or-pipo-support-to-integration-suite-architect',
    categorySlug: 'careers-projects-india',
    authorEmail: 'deepa.menon@seed.cpilancers.com',
    title: 'Transitioning from ABAP or PI/PO L2 support into Integration Suite architecture',
    body: `I have 5 years of experience mostly in SAP PI/PO production monitoring, L2/L3 incident resolution, and occasional ABAP proxy debugging. I want to step up into end-to-end Integration Suite design and pre-sales/architecture.

Which hands-on skills give the fastest credibility leap when interviewing for senior CPI roles in Bengaluru and Pune?`,
    viewCount: 98,
    daysAgo: 8,
    voterEmails: ['ananya.iyer@seed.cpilancers.com', 'meera.krishnan@seed.cpilancers.com'],
    replies: [
      {
        authorEmail: 'ananya.iyer@seed.cpilancers.com',
        hoursAfterThread: 3,
        isAccepted: true,
        voterEmails: [
          'deepa.menon@seed.cpilancers.com',
          'meera.krishnan@seed.cpilancers.com',
        ],
        body: `Your L2/L3 PO + ABAP Proxy background is actually a huge advantage—you already understand how SAP backends fail in production, which many pure-cloud developers miss.

Focus on four areas to make the jump:
1. Security & Connectivity: Master Cloud Connector, STRUST certificates, OAuth2 Client Credentials vs SAML Bearer, and mTLS end-to-end.
2. Reusable iFlow Patterns: Be ready to whiteboard a centralized error handler, JMS async retry + DLQ, and idempotent duplicate handling.
3. Groovy & Payload Literacy: Write clean Groovy without copy-pasted anti-patterns (streaming, no static state, clean JSON/XML parsing).
4. Architecture Trade-offs: Know when to use CPI vs API Management vs Event Mesh vs S/4HANA standard SAP_COM_* communication arrangements.`,
      },
      {
        authorEmail: 'karthik.rao@seed.cpilancers.com',
        hoursAfterThread: 9,
        voterEmails: ['deepa.menon@seed.cpilancers.com'],
        body: `Set up a free BTP Trial subaccount and connect it to a mock REST/OData endpoint (like Northwind or an open API). Building 4-5 clean portfolio iFlows with documented error handling will set you apart immediately.`,
      },
    ],
  },
  {
    key: 'scoping-fixed-bid-vs-tm-pipo-migration',
    categorySlug: 'careers-projects-india',
    authorEmail: 'vikram.singh@seed.cpilancers.com',
    title: 'Scoping fixed-bid vs T&M milestones for PO 7.5 to Integration Suite migrations',
    body: `An enterprise client asked for a fixed-price proposal to migrate 65 SAP PO 7.5 interfaces to Integration Suite, but they haven't completed the Migration Assessment or cleaned up inactive interfaces yet.

How do you structure milestones so you don't absorb unlimited scope risk from undocumented UDFs and missing test partners?`,
    viewCount: 79,
    daysAgo: 3,
    voterEmails: [
      'priya.nair@seed.cpilancers.com',
      'rohan.deshmukh@seed.cpilancers.com',
    ],
    replies: [
      {
        authorEmail: 'priya.nair@seed.cpilancers.com',
        hoursAfterThread: 2,
        isAccepted: true,
        voterEmails: [
          'vikram.singh@seed.cpilancers.com',
          'rohan.deshmukh@seed.cpilancers.com',
        ],
        body: `Never quote a single flat fixed-bid before Discovery is complete. Split the engagement into two clear phases:

Phase 1 (Fixed-Fee Discovery & Assessment — 2 to 3 weeks):
Run Migration Assessment, pull PO traffic logs to retire unused ICOs, classify remaining interfaces into Simple / Medium / Complex / Redesign, and produce the exact migration backlog + test inventory.

Phase 2 (Fixed-Milestone Waves or T&M):
Once Complexity Tiers are signed off in Phase 1, quote per-wave milestones (e.g., Wave 1 Core S/4HANA & Finance, Wave 2 Logistics & 3PL) with explicit assumptions:
- Client provides QA partner connectivity & business UAT sign-off within X business days.
- Undocumented third-party schema changes or net-new requirements go through a Change Request.`,
      },
      {
        authorEmail: 'rohan.deshmukh@seed.cpilancers.com',
        hoursAfterThread: 6,
        voterEmails: ['vikram.singh@seed.cpilancers.com'],
        body: `Also include a dedicated Hypercare window (e.g. 2-4 weeks post-cutover) as an explicit milestone. First month-end close after cutover is when dormant batch/settlement interfaces actually run for the first time.`,
      },
    ],
  },
];
