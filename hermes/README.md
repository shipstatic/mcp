# ShipStatic for Hermes

Deploy static websites, landing pages, and prototypes instantly. Free, no account needed.

Ask Hermes to put your site online, and get back a real link you can share in seconds.

## Try it in seconds, no account needed

```bash
hermes plugins install ship
```

Hermes asks whether to enable it. Say yes. Then just ask, in your own words:

- "Make a one-page site for my bakery and give me a link I can share."
- "Publish the dist folder with ShipStatic's built-in password protection."

You get back a link you can share right away, and a claim link. The site stays up for 3 days, and opening the claim link keeps it for good.

Want it private? Ask for ShipStatic's built-in password protection. Visitors have to type the password before they see anything.

## Keep your sites with a free account

Everything above works with no account. A free account keeps your sites for good, gives you a ShipStatic domain like `yourname.shipstatic.com`, and shows you everything you've published in one place. A custom domain like `www.example.com` needs a paid plan.

Hermes connects with no account, so publishing works straight away. To keep sites in your account, publish with the [ShipStatic CLI](https://docs.shipstatic.com/cli) set up with your [API key](https://my.shipstatic.com/api-key).

## What this plugin runs and sends

- **It connects Hermes to the hosted ShipStatic MCP server** at `https://mcp.shipstatic.com`. Nothing runs on your machine.
- **It sends the files you publish to ShipStatic,** and nothing anywhere else.
- **It holds no key, token or sign-in.** The account tools (your sites, your domains) answer Unauthorized in Hermes; the CLI with an API key covers that.
- **Hermes asks before it publishes.** The server is marked untrusted, so a publish shows you what is about to be sent and waits for a yes (once, for the session, or always). To publish without the question, for example from a cron job, add `ship` to your `config.yaml` under `mcp_servers` with `trust: full`.
- **The claim link is yours alone.** Whoever opens it and signs in owns the site, so don't share it.

This package is configuration only: one server, no code. The same fifteen tools are at `https://mcp.shipstatic.com` for any MCP client, and in [`@shipstatic/mcp`](https://github.com/shipstatic/mcp) to run on your own machine.

[Support](https://www.shipstatic.com/support) • [Privacy](https://www.shipstatic.com/privacy) • [Terms](https://www.shipstatic.com/terms)

## License

MIT
