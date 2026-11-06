# naver-stock-mcp

An MCP server for [Naver Stock Research](https://stock.naver.com/research), a collection of Korean brokerage research reports. It lets a model find relevant reports and return their **Naver detail page URL** (`detailUrl`) and **original PDF URL** (`pdfUrl`).

## Install and build

```bash
npm install
npm run build
```

Requires Node.js 20.18 or later.

## Running

### Local (stdio)

```bash
node dist/index.js
```

Example config for an MCP client such as Claude Desktop or Claude Code:

```json
{
  "mcpServers": {
    "naver-research": {
      "command": "node",
      "args": ["/path/to/naver-stock-mcp/dist/index.js"],
      "env": { "HTTPS_PROXY": "http://proxy.example.com:8080" }
    }
  }
}
```

### Streamable HTTP

```bash
node dist/index.js --transport http --port 3000 --host 127.0.0.1
# or: MCP_TRANSPORT=http MCP_PORT=3000 node dist/index.js
```

- Endpoint: `http://<host>:<port>/mcp` (POST, stateless)
- Health check: `GET /health`
- Binding to `127.0.0.1` or `localhost` enables DNS rebinding protection. When binding to `0.0.0.0`, set `MCP_ALLOWED_HOSTS` to the Host headers you accept. The server has no authentication; if you expose it, put authentication in front of it (for example, a reverse proxy).

```bash
claude mcp add --transport http naver-research http://127.0.0.1:3000/mcp
```

### Docker

Images are published to GitHub Packages from `main` without tags, so pull them by digest. The digest of each build is shown in the workflow run summary.

```bash
docker run --rm -p 3000:3000 \
  -e MCP_ALLOWED_HOSTS=localhost,127.0.0.1 \
  -e HTTPS_PROXY=http://proxy.example.com:8080 \
  ghcr.io/koreapyj/naver-stock-mcp@sha256:<digest>
```

The image runs the Streamable HTTP transport on `0.0.0.0:3000` by default. Set `MCP_ALLOWED_HOSTS` to the Host headers clients use, to keep DNS rebinding protection.

## Environment variables

Real environment variables take precedence. A `.env` file in the working directory is also loaded if present (see `.env.example`).

| Variable | Description | Default |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` or `http` | `stdio` |
| `MCP_HOST` / `MCP_PORT` / `MCP_PATH` | HTTP bind settings | `127.0.0.1` / `3000` / `/mcp` |
| `MCP_ALLOWED_HOSTS` | Allowed Host headers, comma-separated | - |
| `HTTP_PROXY` / `HTTPS_PROXY` | Proxy for outbound requests to Naver. Lowercase names and `user:pass@` credentials are supported | - |
| `NO_PROXY` | Hosts that bypass the proxy | - |
| `NAVER_TIMEOUT_MS` | Request timeout | `15000` |
| `NAVER_USER_AGENT` | User-Agent override | Chrome UA |
| `DOTENV_PATH` | Path of the env file to load | `.env` |

All Naver endpoints use HTTPS, so `HTTPS_PROXY` is usually the only one you need.

## Tools

| Tool | Description |
|---|---|
| `search_research` | Search reports by category, keyword, stock (name or code), industry, broker (name or code), date range and page. Every result has `detailUrl`; with `includePdf: true` each also gets `pdfUrl`. |
| `get_research` | Get one report: full summary, `pdfUrl`, `detailUrl`, target price, previous target price, and stock price on the publication date |
| `find_stock` | Look up stock codes by name |
| `list_brokers` | List brokers and their codes |
| `list_industries` | List industry keys and Korean names for industry reports |

Categories:

| Category | Contents | Web path |
|---|---|---|
| `market` | Market commentary | `/research/daily` |
| `invest` | Investment strategy | `/research/invest` |
| `company` | Company/stock analysis | `/research/company` |
| `industry` | Industry analysis | `/research/industry` |
| `economy` | Economic analysis | `/research/economy` |
| `debenture` | Bonds/fixed income | `/research/debenture` |

Example arguments for `search_research` (Samsung Electronics reports from Mirae Asset):

```json
{ "category": "company", "stocks": ["삼성전자"], "brokers": ["미래에셋"], "size": 5, "includePdf": true }
```

Reports, stock names and broker names are in Korean, so Korean search terms give the best results.

## Testing

```bash
npm run smoke                              # stdio
npm run smoke -- http://127.0.0.1:3000/mcp # a running HTTP server
```

## Notes

This server calls the undocumented API that the Naver Stock website itself uses (`stock.naver.com/api/stockSecurity/researches/v2/*`). It may stop working if Naver changes that API. Research reports are the property of their publishers; follow Naver's and the publishers' terms when using them.

## License

Copyright (C) 2026 Yoonji Park <koreapyj@dcmys.kr>

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program (see [LICENSE](LICENSE)). If not, see <https://www.gnu.org/licenses/>.
