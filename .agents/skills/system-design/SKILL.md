---
name: system-design
description: Reference guide and problem-solving framework for Object-Oriented Design (OOD/OOP) and large-scale Distributed System Design case studies, architectures, tradeoffs, and code implementations. Use when designing scalable systems, solving low-level class design problems, or analyzing architecture tradeoffs.
---

# System Design & Object-Oriented Programming (OOP) Skill

This skill provides a structured reference library and methodology for designing both **low-level object-oriented systems (OOD / OOP)** and **high-level distributed architectures (System Design)**.

The reference assets are organized into two primary categories located under `references-and-study/`:
1. **Object-Oriented Design (`object_oriented_design/`)**: Low-level class design, OOP principles (SOLID, encapsulation, inheritance, polymorphism), design patterns, and concrete Python implementations with test notebooks.
2. **Distributed System Design (`system_design/`)**: End-to-end architectures, scale estimates, high-level diagrams, database schemas, API contracts, caching layers, and tradeoff analyses.

---

## How to Use This Skill

When approaching an architectural or OOP question:
1. **Identify the Scope**: Determine whether the problem is Low-Level Design (LLD / OOD class hierarchies, state machines, clean interfaces) or High-Level Design (HLD / distributed architecture, microservices, databases, caching, scaling).
2. **Consult the Matching Case Study**: Inspect the relevant subfolder under `references-and-study/`.
3. **Read the Reference Documentation**:
   - For **System Design**: Always read the `README.md` within that topic folder first for constraints, capacity estimates, high-level diagrams, and deep dives.
   - For **OOD**: Inspect the `.py` source file for class hierarchies and signatures, and review `.ipynb` for step-by-step walkthroughs and test cases.
4. **Follow the Standard Design Framework**: Apply the 4-step interview structure outlined below.

---

## 4-Step System Design Framework

When tackling distributed system design questions, follow the template established in `system_design/template/`:

1. **Step 1: Scope & Clarify Requirements**
   - Define functional requirements (core user actions and use cases).
   - Clarify out-of-scope features to avoid scope creep.
   - Establish non-functional requirements (availability vs. consistency, latency, throughput, durability).
   - Estimate scale: Daily Active Users (DAU), read/write QPS, storage bandwidth, retention periods.

2. **Step 2: High-Level Architecture**
   - Sketch end-to-end flow: Client -> DNS / CDN -> Load Balancer -> API Gateway / Web Services -> Data Stores & Cache.
   - Define core API contracts (endpoints, payloads, responses).
   - Choose primary data models (relational vs. NoSQL document/key-value/graph).

3. **Step 3: Deep Dive into Core Components**
   - Data partitioning (sharding strategies, consistent hashing).
   - Caching strategies (Cache-aside, Write-through, Write-back; eviction policies like LRU/LFU).
   - Asynchronous processing & message queues (Kafka, RabbitMQ, SQS) for decoupling and spike smoothing.
   - Concurrency control (optimistic vs. pessimistic locking, idempotency keys).

4. **Step 4: Scale, Bottlenecks & Tradeoffs**
   - Address single points of failure (SPOF) with replicas and failover mechanisms.
   - Horizontal scaling vs. vertical scaling.
   - Security (rate limiting, authentication, encryption in transit and at rest).
   - Tradeoff summaries (CAP theorem choices, cost vs. complexity).

---

## Folder Catalog & Case Studies

### 1. Object-Oriented Design (`references-and-study/object_oriented_design/`)

Each case study includes production-ready Python code (`.py`) and a Jupyter Notebook (`.ipynb`) with test assertions:

| Folder | Core Problem & Concepts | Key Classes & Patterns |
|---|---|---|
| [`call_center`](references-and-study/object_oriented_design/call_center) | Call dispatching system with tiered escalation hierarchy. | `Employee` (abstract base), `Operator`, `Supervisor`, `Director`, `Call`, `CallCenter`, `Rank` enum, queue-based dispatch. |
| [`deck_of_cards`](references-and-study/object_oriented_design/deck_of_cards) | Generic deck of playing cards adaptable to specific games (e.g., BlackJack). | `Card`, `Deck`, `Hand`, `BlackJackCard`, `BlackJackHand`, Suit & Value enums. |
| [`hash_table`](references-and-study/object_oriented_design/hash_table) | In-memory hash map implementation from scratch. | `Item`, `HashTable`, collision resolution via separate chaining (linked list / buckets), dynamic resizing. |
| [`lru_cache`](references-and-study/object_oriented_design/lru_cache) | Least Recently Used cache with $O(1)$ read and write operations. | `Node` (doubly-linked list), `LinkedList`, `LruCache` using hash map + doubly-linked list. |
| [`online_chat`](references-and-study/object_oriented_design/online_chat) | Real-time chat messaging service entity model. | `User`, `UserService`, `Chat` (private vs. group), `Message`, `AddRequest`, presence tracking. |
| [`parking_lot`](references-and-study/object_oriented_design/parking_lot) | Multi-level parking garage handling various vehicle sizes. | `Vehicle` (`Motorcycle`, `Car`, `Bus`), `ParkingSpot` (compact, regular, large), `Level`, `ParkingLot`. |

---

### 2. Distributed System Design (`references-and-study/system_design/`)

Each subfolder contains a detailed `README.md` covering use cases, capacity calculations, high-level diagrams (`.png`), database models, and scaling bottlenecks:

| Folder | Problem Statement | Core Concepts & Techniques Covered |
|---|---|---|
| [`template`](references-and-study/system_design/template) | Universal System Design interview template. | Standard 4-step framework, calculation cheatsheets, and architecture diagramming patterns. |
| [`pastebin`](references-and-study/system_design/pastebin) | Design Pastebin / Bitly URL shortener service. | Base62 short URL generation, hash collisions (MD5/Base62), SQL vs. NoSQL object storage, cache eviction, automatic expiration worker. |
| [`twitter`](references-and-study/system_design/twitter) | Design Twitter (Timeline & Tweet publishing). | Fan-out-on-write vs. fan-out-on-read, home timeline caching (Redis clusters), celebrity/influencer handling, asynchronous feed generation. |
| [`mint`](references-and-study/system_design/mint) | Design Mint.com (personal financial manager). | Financial transaction ingestion, categorization engine, MapReduce daily/monthly aggregation, real-time spending budget alerts. |
| [`sales_rank`](references-and-study/system_design/sales_rank) | Design Amazon Best Sellers / Sales Rank. | Rolling time-window sales ranking, MapReduce batch compute vs. real-time log ingestion, top-$K$ caching by category. |
| [`query_cache`](references-and-study/system_design/query_cache) | Design distributed query result cache. | Consistent hashing across cache nodes, cache invalidation strategies, memory-efficient serialization, LRU eviction. |
| [`social_graph`](references-and-study/system_design/social_graph) | Design Facebook Social Graph / mutual friends. | Graph data representation (adjacency lists vs. graph DBs), Bidirectional Breadth-First Search (BFS) for degree of separation, sharding by user ID. |
| [`scaling_aws`](references-and-study/system_design/scaling_aws) | Step-by-step scaling on AWS from 1 to 10M+ users. | Iterative evolution: Single Box -> Separate DB -> Master-Slave DB -> In-memory Caching -> Read Replicas -> Auto Scaling Groups -> CDN -> Microservices. |
| [`web_crawler`](references-and-study/system_design/web_crawler) | Design a large-scale distributed web crawler. | URL Frontier (Politeness & Priority queues), DNS caching, duplicate document detection (SimHash / fingerprinting), crawler traps, robots.txt compliance. |

---

## Quick Reference: System Design Sizing Cheat Sheet

When working through capacity estimations:

- **Powers of 2 / Data Sizes**:
  - $2^{10} \approx 1\text{ KB} = 1,024\text{ bytes}$
  - $2^{20} \approx 1\text{ MB} = 1,048,576\text{ bytes}$
  - $2^{30} \approx 1\text{ GB} = 1,073,741,824\text{ bytes}$
  - $2^{40} \approx 1\text{ TB}$
  - $2^{50} \approx 1\text{ PB}$

- **Time Conversions**:
  - Seconds in a day: $86,400 \approx 10^5\text{ seconds}$
  - $1\text{ million requests / day} \approx 12\text{ requests / second (QPS)}$
  - $10\text{ million requests / day} \approx 120\text{ QPS}$
  - $100\text{ million requests / day} \approx 1,200\text{ QPS}$
  - Peak QPS typically estimated as $2\times$ to $5\times$ average QPS.

- **Latency Numbers Every Engineer Should Know**:
  - L1 cache reference: $\approx 0.5\text{ ns}$
  - L2 cache reference: $\approx 7\text{ ns}$
  - Main memory (RAM) reference: $\approx 100\text{ ns}$
  - SSD read: $\approx 150\text{ }\mu\text{s}$
  - HDD seek / read: $\approx 10\text{ ms}$
  - Datacenter round trip (same region): $\approx 0.5\text{ ms}$
  - Cross-continental round trip: $\approx 150\text{ ms}$

