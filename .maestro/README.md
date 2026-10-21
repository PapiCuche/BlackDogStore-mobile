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

## Two selector lessons, learned the hard way

**Maestro matches the whole string.** A product card exposes one accessibility
label — «iPhone 15 Pro, S/ 5,599.00, Últimas unidades» — so `"iPhone 15 Pro"`
does not match it and `".*iPhone 15 Pro.*"` does.

**Tap a field by its placeholder, not by its label.** `Input` puts the label on
the caption, on the field's `accessibilityLabel` and on its wrapper; only the
field itself takes focus. Tapping «Efectivo recibido» looked like it worked —
the step reported COMPLETED — and the text went nowhere, which showed up as the
server refusing the sale with «Indica el efectivo recibido.»

## Safety

`03-pos-sale` WRITES: it charges a real sale and moves real stock. It starts by
reading the API base the app resolved, from Profile → «Estado de integración»,
and refuses to continue if it names the production host. That check reads the
app's own resolved value rather than trusting an environment variable the
runner could get wrong.
