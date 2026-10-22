# Maestro QA flows

Developer tooling for the **development build on a simulator**. Nothing here
ships: the app does not import these files and the bundle does not contain
them.

## Running

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk        # brew does not symlink it
export PATH="$JAVA_HOME/bin:/opt/homebrew/bin:$PATH"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

maestro --platform ios test \
  -e METRO_URL="http://$(ipconfig getifaddr en0):8099" \
  .maestro/03-pos-sale.yaml
```

`--platform ios` is required: without it Maestro looks for a connected device
and finds none.

## Why `00-connect-dev-client` exists

A development build starts on its own launcher, and iOS asks «¿Abrir en "Black
Dog"?» when a server is opened by URL. Both are system UI, outside the app, and
neither can be driven from `simctl` — which is the reason Maestro is here at
all. Every other flow begins by chaining `00`, which is idempotent.

The server is addressed by its **URL**, never by its name: the launcher lists
today's server and every one it remembers, all called «Black Dog Store», so a
tap on the name is a coin toss between the current address and a stale one from
another network.

## The flows

| Flow | What it proves | Writes |
|------|----------------|--------|
| `00-connect-dev-client` | The build is loaded from today's Metro server. | — |
| `01-customer-surface` | The shop, a product and the cart. | — |
| `02-internal-navigation` | The internal area opens and lists its modules. | — |
| `03-pos-sale` | A sale is charged at the till. | sale, stock |
| `04-inventory` | Summary, stock list, kardex, and a manual movement. | movement |
| `05-transfers` | A draft between two branches, then withdrawn. | transfer |
| `06-orders` | List, a search that matches nobody, one order opened. | — |
| `07-customers` | Search, a person expanded, the intake button reached. | — |
| `08-service-board` | The repair board, its search, one order opened. | — |
| `09-service-intake` | A device received for a customer on file. | service order |
| `10-service-diagnosis` | The order moved into diagnosis and a finding saved. | diagnosis |
| `11-service-quote` | A quote composed, sent and approved. | quote, decision |
| `12-service-evidence` | A photo through the real iOS picker, uploaded. | photo |
| `13-communications` | A communiqué drafted, aimed and published. | communiqué |
| `14-notices` | The inbox and its unread filter. | — |
| `15-platform` | The platform section and its status filters. | — |
| `16-pdf-share` | The 80 mm ticket fetched and handed to the share sheet. | — |
| `17-tracking-link` | The customer's link revealed, then replaced. | link rotation |
| `18-deep-links` | Four addresses, including one that does not exist. | — |
| `19-resume` | Background and back, with nothing latched offline. | — |

Flows chain: `10` runs `09` first, `11` runs `10`, `16` runs `11`. Each one
therefore works on an order it opened itself, rather than on whichever row
happens to be in the fixture.

## Selector lessons, learned the hard way

**Maestro matches the whole string.** A product card exposes one accessibility
label — «iPhone 15 Pro, S/ 5,599.00, Últimas unidades» — so `"iPhone 15 Pro"`
does not match it and `".*iPhone 15 Pro.*"` does.

**Tap a field by its placeholder, not by its label.** `Input` puts the label on
the caption, on the field's `accessibilityLabel` and on its wrapper; only the
field itself takes focus. Tapping «Efectivo recibido» looked like it worked —
the step reported COMPLETED — and the text went nowhere, which showed up as the
server refusing the sale with «Indica el efectivo recibido.»

**A card is ONE element, and its lines are joined by commas.** An order card
reads «#38, S/ 5,599.00, Sin nombre, Pago: Pagado · Entrega: Entregado», so a
flow matches the shape of the whole line. `EmptyState` does the same with its
title and message.

**A pressable container hides what is inside it.** This is how the customers
screen was found to be unreachable with VoiceOver: the whole card was the
control, so the buttons inside it existed on screen and nowhere in the
accessibility tree. Only the name row opens the card now.

**The keyboard hides what is behind it.** An element under the keyboard is not
visible to Maestro, and tapping it presses whatever key is in that spot —
«Guardar» once typed a «D» into the field instead of saving. Multiline fields
have no return key, so `hideKeyboard` fails on them; a downward swipe dismisses
the keyboard, which is what the screen itself does.

**The navigation bar floats over the list.** A button that stops just under it
counts as visible, and the tap lands on the bar. `centerElement: true` moves it
into the open.

**`launchApp` terminates the app first.** Resuming needs
`launchApp: { stopApp: false }`; otherwise the flow is testing a cold start.

**A name can belong to two things.** «Añadir línea» is both a caption and a
button, and tapping by name hits the caption. Reach the button by position
instead, under the hint above it.

## Safety

Every writing flow starts with `shared/open-internal.yaml`, which reads the API
base the app RESOLVED — Profile → «Estado de integración» — and refuses to
continue if it names the production host. That check reads the app's own answer
rather than trusting an environment variable the runner could get wrong.

These flows charge sales, move stock, open repair orders and publish
communiqués. They are for the scratch backend. Nothing here is safe to point at
production, and the guard is what stops it.

## What the flows cannot cover yet

- **Marking a notice as read** (`14`). The QA account publishes communiqués but
  never receives one: the audience is the company's active internal members and
  this account reaches the area as a superuser. It needs a member account in
  the fixture.
- **Despatching and receiving a transfer** (`05`). Covered as a contract smoke
  instead; driving it through the UI collides on selectors that have nothing to
  do with the app.
