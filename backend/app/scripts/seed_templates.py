"""Seed the templates table with starter PlantUML templates.

Usage:
    docker compose run --rm backend python -m app.scripts.seed_templates
"""

import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

TEMPLATES = [
    # ── Sequence Diagrams ──
    {
        "name": "Basic Sequence",
        "description": "Two participants exchanging messages.",
        "diagram_type": "sequence",
        "sort_order": 1,
        "content": """\
@startuml
participant Alice
participant Bob

Alice -> Bob: Request
Bob --> Alice: Response
@enduml""",
    },
    {
        "name": "Sequence with Notes",
        "description": "Sequence diagram with notes and activation.",
        "diagram_type": "sequence",
        "sort_order": 2,
        "content": """\
@startuml
actor User
participant "Web App" as App
participant "API Server" as API
database "Database" as DB

User -> App: Submit Form
activate App

App -> API: POST /data
activate API

note right of API: Validate input

API -> DB: INSERT record
activate DB
DB --> API: OK
deactivate DB

API --> App: 201 Created
deactivate API

App --> User: Show success
deactivate App
@enduml""",
    },
    {
        "name": "Sequence with Grouping",
        "description": "Sequence diagram with alt/loop groups.",
        "diagram_type": "sequence",
        "sort_order": 3,
        "content": """\
@startuml
participant Client
participant Server
participant Cache

Client -> Server: GET /resource

alt Cache hit
    Server -> Cache: lookup(key)
    Cache --> Server: cached data
    Server --> Client: 200 OK (cached)
else Cache miss
    Server -> Cache: lookup(key)
    Cache --> Server: null
    Server -> Server: compute result
    Server -> Cache: store(key, result)
    Server --> Client: 200 OK
end

loop Every 60 seconds
    Server -> Cache: cleanup expired
end
@enduml""",
    },
    # ── Class Diagrams ──
    {
        "name": "Basic Class",
        "description": "Simple class with attributes and methods.",
        "diagram_type": "class",
        "sort_order": 1,
        "content": """\
@startuml
class Animal {
    +name: String
    +age: int
    +makeSound(): void
    +move(): void
}

class Dog {
    +breed: String
    +fetch(): void
}

class Cat {
    +indoor: boolean
    +purr(): void
}

Animal <|-- Dog
Animal <|-- Cat
@enduml""",
    },
    {
        "name": "Class with Relationships",
        "description": "Classes with various UML relationships.",
        "diagram_type": "class",
        "sort_order": 2,
        "content": """\
@startuml
class User {
    +id: int
    +email: String
    +register(): void
    +login(): void
}

class Order {
    +id: int
    +total: Decimal
    +place(): void
    +cancel(): void
}

class Product {
    +id: int
    +name: String
    +price: Decimal
}

class OrderItem {
    +quantity: int
}

User "1" --> "*" Order : places
Order "1" *-- "*" OrderItem : contains
OrderItem "*" --> "1" Product : references
@enduml""",
    },
    {
        "name": "Class with Packages",
        "description": "Classes organized into packages.",
        "diagram_type": "class",
        "sort_order": 3,
        "content": """\
@startuml
package "Domain" {
    class Entity {
        +id: int
    }
    class User extends Entity {
        +email: String
    }
    class Document extends Entity {
        +title: String
        +content: String
    }
}

package "Repository" {
    interface Repository<T> {
        +findById(id: int): T
        +save(entity: T): void
        +delete(id: int): void
    }
    class UserRepository implements Repository
    class DocumentRepository implements Repository
}

UserRepository ..> User
DocumentRepository ..> Document
@enduml""",
    },
    # ── Activity Diagrams ──
    {
        "name": "Basic Activity",
        "description": "Simple activity flow with start and stop.",
        "diagram_type": "activity",
        "sort_order": 1,
        "content": """\
@startuml
start
:Receive request;
:Validate input;

if (Valid?) then (yes)
    :Process data;
    :Save to database;
    :Return success;
else (no)
    :Return error;
endif

stop
@enduml""",
    },
    {
        "name": "Activity with Swim Lanes",
        "description": "Activity diagram with swim lane partitions.",
        "diagram_type": "activity",
        "sort_order": 2,
        "content": """\
@startuml
|Customer|
start
:Browse products;
:Add to cart;
:Checkout;

|Payment Service|
:Process payment;

if (Payment OK?) then (yes)
    |Warehouse|
    :Pick items;
    :Pack order;
    :Ship order;

    |Customer|
    :Receive order;
    stop
else (no)
    |Customer|
    :Show payment error;
    stop
endif
@enduml""",
    },
    {
        "name": "Activity with Fork/Join",
        "description": "Parallel activity flows using fork and join.",
        "diagram_type": "activity",
        "sort_order": 3,
        "content": """\
@startuml
start
:Initialize build;

fork
    :Compile source;
fork again
    :Run linter;
fork again
    :Run type checker;
end fork

:Run unit tests;

if (All passed?) then (yes)
    :Build Docker image;
    :Push to registry;
    :Deploy to staging;
    stop
else (no)
    :Send failure notification;
    stop
endif
@enduml""",
    },
    # ── Use Case ──
    {
        "name": "Use Case Diagram",
        "description": "Actors and use cases with relationships.",
        "diagram_type": "use_case",
        "sort_order": 1,
        "content": """\
@startuml
left to right direction
actor Customer
actor Admin

rectangle "Online Store" {
    usecase "Browse Products" as UC1
    usecase "Place Order" as UC2
    usecase "Track Order" as UC3
    usecase "Manage Products" as UC4
    usecase "View Reports" as UC5
    usecase "Make Payment" as UC6
}

Customer --> UC1
Customer --> UC2
Customer --> UC3
UC2 ..> UC6 : <<include>>

Admin --> UC4
Admin --> UC5
@enduml""",
    },
    # ── Component ──
    {
        "name": "Component Diagram",
        "description": "System components and their interfaces.",
        "diagram_type": "component",
        "sort_order": 1,
        "content": """\
@startuml
package "Frontend" {
    [React App] as react
    [API Client] as client
}

package "Backend" {
    [REST API] as api
    [Auth Service] as auth
    [Business Logic] as logic
}

package "Data Layer" {
    [PostgreSQL] as db
    [Redis Cache] as cache
}

react --> client
client --> api : HTTPS
api --> auth
api --> logic
logic --> db
logic --> cache
@enduml""",
    },
    # ── State ──
    {
        "name": "Basic State",
        "description": "Simple state machine diagram.",
        "diagram_type": "state",
        "sort_order": 1,
        "content": """\
@startuml
[*] --> Draft

Draft --> Review : Submit
Review --> Draft : Request changes
Review --> Approved : Approve
Review --> Rejected : Reject
Approved --> Published : Publish
Published --> Archived : Archive
Rejected --> Draft : Revise
Archived --> [*]
@enduml""",
    },
    {
        "name": "State with Nested States",
        "description": "State diagram with composite states.",
        "diagram_type": "state",
        "sort_order": 2,
        "content": """\
@startuml
[*] --> Active

state Active {
    [*] --> Idle
    Idle --> Processing : receive job
    Processing --> Idle : job complete
    Processing --> Error : failure

    state Error {
        [*] --> Retrying
        Retrying --> Retrying : retry
        Retrying --> [*] : max retries
    }

    Error --> Idle : recovered
}

Active --> Shutdown : stop signal
Shutdown --> [*]
@enduml""",
    },
    # ── Deployment ──
    {
        "name": "Deployment Diagram",
        "description": "Infrastructure deployment layout.",
        "diagram_type": "deployment",
        "sort_order": 1,
        "content": """\
@startuml
node "Load Balancer" as lb {
    [Nginx]
}

node "App Server 1" as app1 {
    [FastAPI]
    [Uvicorn]
}

node "App Server 2" as app2 {
    [FastAPI] as api2
    [Uvicorn] as uv2
}

node "Database Server" as dbsrv {
    database "PostgreSQL" as db
    database "Redis" as redis
}

lb --> app1 : HTTP
lb --> app2 : HTTP
app1 --> dbsrv
app2 --> dbsrv
@enduml""",
    },
    # ── Entity-Relationship ──
    {
        "name": "ER Diagram",
        "description": "Entity-relationship diagram for a database.",
        "diagram_type": "entity_relationship",
        "sort_order": 1,
        "content": """\
@startuml
entity "User" as user {
    *id : bigint <<PK>>
    --
    *email : varchar
    *username : varchar
    display_name : varchar
    created_at : timestamptz
}

entity "Document" as doc {
    *id : bigint <<PK>>
    --
    *title : text
    *owner_id : bigint <<FK>>
    folder_id : bigint <<FK>>
    current_content : text
    updated_at : timestamptz
}

entity "Folder" as folder {
    *id : bigint <<PK>>
    --
    *name : text
    *owner_id : bigint <<FK>>
}

user ||--o{ doc : owns
user ||--o{ folder : owns
folder ||--o{ doc : contains
@enduml""",
    },
    # ── Gantt ──
    {
        "name": "Gantt Chart",
        "description": "Project timeline with tasks and dependencies.",
        "diagram_type": "gantt",
        "sort_order": 1,
        "content": """\
@startgantt
Project starts 2026-01-01
[Design] lasts 10 days
[Backend Development] lasts 15 days
[Backend Development] starts at [Design]'s end
[Frontend Development] lasts 15 days
[Frontend Development] starts at [Design]'s end
[Integration Testing] lasts 5 days
[Integration Testing] starts at [Backend Development]'s end
[Integration Testing] starts at [Frontend Development]'s end
[Deployment] lasts 3 days
[Deployment] starts at [Integration Testing]'s end
@endgantt""",
    },
    # ── Mindmap ──
    {
        "name": "Mindmap",
        "description": "Hierarchical mindmap diagram.",
        "diagram_type": "mindmap",
        "sort_order": 1,
        "content": """\
@startmindmap
* Project Planning
** Requirements
*** User Stories
*** Acceptance Criteria
*** Priority Matrix
** Design
*** Architecture
*** Database Schema
*** API Specification
*** UI Mockups
** Development
*** Backend
*** Frontend
*** Testing
** Deployment
*** Staging
*** Production
*** Monitoring
@endmindmap""",
    },
    # ── JSON ──
    {
        "name": "JSON Visualization",
        "description": "Visual representation of a JSON structure.",
        "diagram_type": "json",
        "sort_order": 1,
        "content": """\
@startjson
{
    "user": {
        "id": 1,
        "name": "Alice",
        "email": "alice@example.com",
        "roles": ["admin", "editor"],
        "preferences": {
            "theme": "dark",
            "language": "en"
        }
    }
}
@endjson""",
    },
    # ── Network ──
    {
        "name": "Network Diagram",
        "description": "Network topology using nwdiag.",
        "diagram_type": "network",
        "sort_order": 1,
        "content": """\
@startuml
nwdiag {
    internet [shape = cloud];
    internet -- dmz

    network dmz {
        address = "10.0.1.0/24"

        web01 [address = "10.0.1.1"];
        web02 [address = "10.0.1.2"];
    }

    network internal {
        address = "10.0.2.0/24"

        web01 [address = "10.0.2.1"];
        web02 [address = "10.0.2.2"];
        db01 [address = "10.0.2.100"];
    }
}
@enduml""",
    },
    # ── Wireframe (Salt) ──
    {
        "name": "Wireframe (Salt)",
        "description": "UI wireframe mockup using Salt.",
        "diagram_type": "wireframe",
        "sort_order": 1,
        "content": """\
@startsalt
{+
    Login
    ==
    {
        Email    | "user@example.com   "
        Password | "****               "
    }
    [  Cancel  ] | [  **Login**  ]
    ---
    <i>Forgot password?</i>
}
@endsalt""",
    },
]


async def seed():
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        result = await db.execute(text("SELECT COUNT(*) FROM templates"))
        count = result.scalar()
        if count > 0:
            print(f"Templates table already has {count} rows, skipping seed.")
            await engine.dispose()
            return

        for t in TEMPLATES:
            await db.execute(
                text("""
                    INSERT INTO templates (name, description, diagram_type, content, sort_order)
                    VALUES (:name, :description, :diagram_type, :content, :sort_order)
                """),
                t,
            )
        await db.commit()

    await engine.dispose()
    print(f"Seeded {len(TEMPLATES)} templates.")


if __name__ == "__main__":
    asyncio.run(seed())
