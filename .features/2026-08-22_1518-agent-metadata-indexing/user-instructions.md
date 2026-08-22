2026-08-22 15:18
quando estiver presente na requisição o atributo _agent_metadata, como podemos fazer para indexar esses campos para permitir filtro e dashboards. pensei em ter uma configuração padrão de quais campos permitem filtro e metricas a partir deles. inicialmente pensei nos: os, hostname, agent-name - mas permitir que o usuário adicione ou remova. exemplo do que vem na requisição: "_agent_metadata": [
    {
      "key": "session-id",
      "value": "01a02aa9-98cd-793e-bbe8-0605654b3790"
    },
    {
      "key": "session-created-at",
      "value": "2026-08-22T18:09:12.909Z"
    },
    {
      "key": "os",
      "value": "linux"
    },
    {
      "key": "os-version",
      "value": "6.12.101+deb13-amd64"
    },
    {
      "key": "hostname",
      "value": "allanbatista-workstation"
    },
    {
      "key": "agent-name",
      "value": "pi"
    },
    {
      "key": "agent-version",
      "value": "unknown"
    },
    {
      "key": "tz",
      "value": "America/Sao_Paulo"
    },
    {
      "key": "requested-at",
      "value": "2026-08-22T18:14:24.175Z"
    },
    {
      "key": "cwd",
      "value": "/home/allanbatista/Workspaces/n9router/9router"
    },
    {
      "key": "provider",
      "value": "batista"
    },
    {
      "key": "model",
      "value": "batista-high"
    },
    {
      "key": "api",
      "value": "openai-completions"
    },
    {
      "key": "mode",
      "value": "tui"
    }
  ]
