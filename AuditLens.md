# Documento de Especificação de Arquitetura e Design de Sistema (SDD) — AuditLens Orchestrator

Este documento detalha a arquitetura de software, as decisões de projeto de engenharia, a formulação algorítmica e a especificação de interfaces do **AuditLens**, um orquestrador e plataforma para auditoria e descoberta em tempo real de fatias de erro (*error slices*) em modelos de aprendizado de máquina. A plataforma fornece diagnósticos de desempenho de modelos sob uma perspectiva de subgrupos estatísticos e análise de contraste multi-classe.

---

## 1. Introdução e Contextualização

A avaliação global de modelos de aprendizado de máquina frequentemente mascara disparidades sistemáticas de desempenho entre diferentes subgrupos de dados. O **AuditLens** foi concebido para mitigar essa lacuna, atuando como um orquestrador que coordena processos de busca de fatias (*slices*) sistemáticas de erro. 

O sistema processa dados empíricos de desempenho de modelos, executando um algoritmo de exploração espacial para identificar e caracterizar subgrupos com taxas de erro discrepantes em comparação com a linha de base geral do modelo. A arquitetura viabiliza tanto simulações sintéticas locais (para validação de conceitos) quanto a ingestão dinâmica de dados provenientes de trabalhadores de busca paralelos (*search workers*), tudo gerenciado por meio de uma interface rica baseada no paradigma *human-in-the-loop* (interação ativa humana no ciclo de processamento).

---

## 2. Arquitetura Geral do Sistema

O AuditLens baseia-se em uma arquitetura de sistemas distribuídos e orientada a eventos de acoplamento fraco, estruturada sob o modelo cliente-servidor assíncrono. O sistema é segmentado em três camadas lógicas fundamentais:

```
+------------------------------------------------------------+
|                     Camada de Apresentação                 |
|             (Interface SPA em Vanilla JS / ECharts)        |
+------------------------------+-----------------------------+
                               ^
                               | Comunicação Assíncrona 
                               | (WebSockets & REST HTTP)
                               v
+------------------------------------------------------------+
|                       Camada de Serviço                    |
|             (FastAPI Orchestrator & State Manager)         |
+------------------------------+-----------------------------+
                               ^
                               | Leitura / Escrita Estado
                               v
+------------------------------------------------------------+
|                      Camada de Persistência                |
|                    (audit_history.json)                    |
+------------------------------------------------------------+
```

1. **Orquestrador Central (Backend)**: Desenvolvido sobre um paradigma assíncrono, gerencia o estado da auditoria, valida as parametrizações do algoritmo de busca, controla o consumo de orçamento computacional, persiste o histórico de iterações e atua como um hub de mensageria para transmitir os snapshots de descoberta.
2. **Agente de Visualização e Controle (Frontend)**: Uma aplicação de página única (*Single Page Application* - SPA) que processa fluxos contínuos de dados e renderiza painéis analíticos interativos de alta fidelidade para monitoramento e reparametrização dinâmica do algoritmo de busca.
3. **Mecanismo de Busca (MCTS/Workers)**: Um componente conceitual que pode operar de forma acoplada (via simulador interno de Monte Carlo Tree Search) ou desacoplada (via APIs REST comworkers externos), encarregado de navegar no espaço combinatório de regras de subgrupos.

---

## 3. Tecnologias Empregadas

O ecossistema tecnológico do AuditLens foi selecionado para garantir latência mínima na comunicação de dados em tempo real, consistência operacional e modularidade na renderização gráfica.

*   **Ambiente Backend (Servidor de Orquestração)**:
    *   **FastAPI**: Framework de alto desempenho em Python para construção de APIs RESTful e WebSockets. A escolha baseia-se em seu suporte nativo à programação assíncrona (`asyncio`), geração automática de esquemas OpenAPI e alto throughput.
    *   **Uvicorn**: Servidor ASGI de produção utilizado para hospedar a aplicação FastAPI com baixo overhead de rede.
    *   **Pydantic (v2)**: Biblioteca de validação de dados e gerenciamento de configurações que garante a aderência rigorosa das mensagens recebidas e transmitidas aos modelos de dados definidos.
*   **Ambiente Frontend (Painel do Auditor)**:
    *   **Vanilla JavaScript (ES6+)**: Empregado para garantir a ausência de sobrecarga associada a frameworks de renderização virtualizada (como React ou Vue), otimizando a resposta tátil a grandes volumes de mensagens WebSocket.
    *   **Apache ECharts**: Motor gráfico vetorial de alta performance para a renderização de gráficos complexos tridimensionais, dispersões e distribuições contínuas na árvore de decisão.
    *   **Tailwind CSS**: Framework utilitário de CSS adotado para estruturação visual responsiva sob uma estética escura voltada para ambientes operacionais de monitoramento.

---

## 4. Formulação Algorítmica e Módulo de Busca

A busca por subgrupos vulneráveis (ou fatias de erro) é modelada como um problema de busca em árvore em um espaço de estados combinatório estruturado a partir das conjunções de atributos dos dados. O AuditLens orquestra esse processo computacional parametrizando e avaliando as fatias de acordo com a formulação matemática descrita a seguir.

### 4.1. Formalização de Métricas de Avaliação de Subgrupos

Dada uma fatia ou subgrupo $g$ definido por um descritor de padrão (por exemplo, uma sequência de eventos ou conjunção de atributos), as instâncias de dados cobertas por $g$ são divididas em duas classes baseadas no resultado do modelo (classe 0 representa acertos/erros tipo A e classe 1 representa erros tipo B).

Sejam:
*   $n_{0, g}$ e $n_{1, g}$ a contagem de amostras da classe 0 e classe 1 pertencentes ao subgrupo $g$, com o suporte total do subgrupo definido por:
    $$S_g = n_{0, g} + n_{1, g}$$
*   $\mu_{0, g}$ e $\mu_{1, g}$ a taxa média de erro associada a cada classe no subgrupo $g$.
*   $\sigma_{0, g}^2$ e $\sigma_{1, g}^2$ a variância dos erros para cada classe no subgrupo $g$.

O AuditLens calcula as seguintes propriedades diagnósticas chaves para cada padrão descoberto:

#### 1. Diferença de Erro Inter-classes (Força de Contraste - $\Delta_g$)
Mede a magnitude absoluta da disparidade de erro entre as duas classes sob escrutínio no subgrupo:
$$\Delta_g = |\mu_{0, g} - \mu_{1, g}|$$

#### 2. Razão de Separação Estatística ($SG$)
Mapeia a força de contraste em relação à dispersão do erro, penalizando fatias que apresentam alta variabilidade interna:
$$SG = \frac{\Delta_g}{1.0 + \max(\sigma_{0, g}^2, \sigma_{1, g}^2)}$$

#### 3. Desvio da Linha de Base ($DG$)
Avalia a discrepância do desempenho do subgrupo em relação aos limiares de tolerância esperados para cada classe (definidos arbitrariamente como $0.3$ para classe 0 e $0.32$ para classe 1):
$$DG = \max(|\mu_{0, g} - 0.3|, |\mu_{1, g} - 0.32|)$$

#### 4. Penalidade de Suporte ($PG$)
Impede que o algoritmo de busca se concentre excessivamente em subgrupos microscópicos (ruídos estatísticos), aplicando uma penalização amortecida baseada no tamanho total da amostra ajustada pelo coeficiente de suporte $\gamma \in [0, 1]$:
$$PG = \left(\frac{S_g}{1000.0}\right)^\gamma$$

#### 5. Equilíbrio de Classes ($BG$)
Favorece subgrupos que possuem representação equilibrada de ambas as classes, evitando a descoberta de fatias homogêneas não informativas sobre vieses comparativos:
$$BG = 1.0 - \frac{|n_{0, g} - n_{1, g}|}{S_g}$$

#### 6. Pontuação de Qualidade Phi ($\phi_g$)
A qualidade global combinada de um padrão é primeiramente agregada em uma escala linear e, em seguida, mapeada para um intervalo normalizado através de uma função logística:
$$Quality_{raw} = (SG \times DG) \times (BG \times PG)$$
$$\phi_g = \frac{1.0}{1.0 + e^{-3.0 \times Quality_{raw}}}$$

#### 7. Weighted Relative Accuracy (WRAcc Contrast)
Avalia o compromisso entre a generalidade da fatia (fração de suporte sobre o total) e o ganho de erro diferencial de contraste:
$$WRAcc = \left(\frac{S_g}{N}\right) \times \Delta_g$$

#### 8. Eficiência Algorítmica ($Ef_g$)
Mede a taxa de retorno de qualidade do padrão descoberto em função do orçamento computacional gasto (tempo de execução acumulado do buscador $C$):
$$Ef_g = \frac{\phi_g}{\max(1.0, C)}$$

### 4.2. Monte Carlo Tree Search (MCTS) e Controle de Exploração

Na busca heurística por padrões, a árvore de estados é percorrida balanceando exploração e explotação usando a métrica UCT (*Upper Confidence Bound applied to Trees*). A constante UCT reguladora ($C_{uct}$) determina o peso do termo de incerteza (exploração) no processo seletivo dos nós da árvore de busca:

$$UCT = \text{Aproveitamento} + C_{uct} \times \sqrt{\frac{\ln(\text{Visitas do Pai})}{\text{Visitas do Nó}}}$$

A diversidade das fatias selecionadas é mantida pela aplicação de uma filtragem de redundância baseada no coeficiente de Jaccard ($\theta$). Se dois subgrupos $g_A$ e $g_B$ cobrem conjuntos de instâncias de dados muito semelhantes, tal que:
$$Jaccard(g_A, g_B) = \frac{|g_A \cap g_B|}{|g_A \cup g_B|} > \theta$$
A fatia de menor qualidade é suprimida do conjunto ativo de snapshots gerados.

---

## 5. Detalhamento de APIs e Comunicação

A comunicação de dados entre os componentes do ecossistema do AuditLens é estruturada através de endpoints HTTP para controle e configuração, e conexões WebSocket bidirecionais contínuas para streaming de telemetria.

```
       +------------------+                   +------------------+
       |   Cliente SPA    |                   |    Backend API   |
       +--------+---------+                   +--------+---------+
                |                                      |
                |--- POST /api/config ---------------->|
                |<-- Confirmar Atualização ------------|
                |                                      |
                |=== WS /ws/snapshots (Conectar) =====>|
                |<-- Status Inicial da Auditoria ------|
                |                                      |
                |                   +------------------+------------------+
                |                   | Processamento assíncrono            |
                |                   | (Geração de Snapshots da auditoria) |
                |                   +------------------+------------------+
                |                                      |
                |<-- Broadcast Snapshot {type: "snap"}--|
                |<-- Broadcast Status {type: "status"}-|
                |                                      |
```

### 5.1. Endpoints de Controle REST HTTP

*   `POST /api/config`: Define e atualiza as variáveis de controle do buscador (limites de suporte, ignore lists, pesos de ponderação e coeficientes algorítmicos).
*   `POST /api/snapshots`: Ponto de entrada para ingestão assíncrona de snapshots completos gerados por processos de auditoria distribuídos paralelos.
*   `POST /api/slices`: Recebe registros de fatias individuais avulsas enviadas por analisadores externos, encapsulando-os automaticamente no formato de relatório interno.
*   `POST /api/control/{action}`: Controla o estado de execução da auditoria. Ações válidas incluem: `pause` (pausar busca), `resume` (retomar busca), `finish` (encerrar ciclo de execução) e `clear` (limpar histórico persistido).
*   `POST /api/control/inject`: Permite a injeção sob demanda de orçamento extra (tempo em segundos) e define prioridades dinâmicas de pesos em nós específicos da árvore de busca.
*   `POST /api/control/focus`: Alterna o foco de busca do motor, aumentando a ponderação heurística em ramos específicos com o objetivo de concentrar a capacidade computacional em nós promissores.
*   `GET /api/config/current`: Permite que os trabalhadores de busca extraiam em formato pull as parametrizações de algoritmo ativas no orquestrador.
*   `GET /api/logs`: Recupera a série histórica de snapshots de auditoria armazenados.

### 5.2. Canal de Telemetria (WebSockets)

*   `/ws/snapshots`: Canal de transmissão em tempo real das descobertas estruturadas em snapshots de auditoria e atualizações de status global do sistema. Utiliza codificação JSON nativa com lógica de reconexão automática e autolimpeza em caso de desconexão abrupta do cliente.

---

## 6. Arquitetura e Padrões de Projeto do Frontend

O frontend do AuditLens segue princípios rígidos de engenharia de software para garantir reatividade extrema a dados contínuos.

### 6.1. Visualizer Registry Pattern (Padrão de Registro de Visualizadores)

Para acomodar uma gama dinâmica de análises gráficas sem acoplar fortemente o ciclo de vida dos componentes à renderização da interface, foi implementado o padrão de projeto *Registry*.

```
+---------------------------------------------------------------+
|                      VisualizerRegistry                       |
+---------------------------------------------------------------+
| - visualizers: Map<string, typeof BaseVisualizer>             |
+---------------------------------------------------------------+
| + register(id: string, VisualizerClass: BaseClass): void      |
| + create(id: string, container: HTMLElement): BaseVisualizer  |
+---------------------------------------------------------------+
                               |
                               | Instancia
                               v
+---------------------------------------------------------------+
|                        BaseVisualizer                         |
+---------------------------------------------------------------+
| # container: HTMLElement                                      |
| # chart: echarts.EChartsInstance                              |
| # data: Array<any>                                            |
+---------------------------------------------------------------+
| + update(data: any): void                                     |
| + render(): void (abstrato)                                   |
| + dispose(): void                                             |
+---------------------------------------------------------------+
        ^                       ^                       ^
        | Herança               | Herança               | Herança
+-------+-------+       +-------+-------+       +-------+-------+
| QualityScatter|       |ErrorDistribution|     |ParetoFrontier |
+---------------+       +---------------+       +---------------+
```

A classe `VisualizerRegistry` atua como uma fábrica estendível. Gráficos específicos (como `QualityScatter`, `ErrorDistribution`, `MetricsEvolution` e `ParetoFrontier`) estendem a classe abstrata `BaseVisualizer`, implementando as rotinas de preparação de dados e renderização do ECharts dentro do método `render()`. Esta abstração desacopla a recepção física das mensagens WebSocket de sua respectiva projeção gráfica na tela.

### 6.2. Componentes de Visualização Implementados

*   **Priority Matrix (Matriz de Prioridade em 4 Quadrantes)**: Gráfico de dispersão cruzando Suporte no eixo X com a Força de Contraste ($\Delta_g$) no eixo Y. Segmenta visualmente os padrões descobertos em quatro regiões (Alto Risco, Subgrupos de Nicho, Ruído, Ignorar), provendo suporte visual instantâneo para tomadas de decisão regulatória.
*   **Pareto Frontier (Fronteira de Pareto)**: Plotagem bidimensional que mapeia a Qualidade em relação ao Suporte, traçando a curva convexa ideal de padrões não dominados. Auxilia o auditor a identificar subgrupos com o melhor balanço entre relevância amostral e severidade de erro.
*   **Kernel Density Estimation (KDE Chart)**: Gráfico de distribuição de probabilidade contínua integrado à vista detalhada de fatias. Compara a densidade das taxas de erro entre a classe 0 e a classe 1, permitindo aferir a significância estatística do contraste observado.
*   **Tree Topology & Depth Distribution**: Histograma dinâmico que exibe a topologia da árvore MCTS (distribuição de nós por profundidade e fator de ramificação), indicando visualmente se a busca está convergindo ou dispersando.
*   **MCTS Tree Diagnostics (KPIs Anytime)**: Painel composto que rastreia taxas de sucesso de rollout, estabilidade de iterações, contagem cumulativa de nós explorados e taxa instantânea de expansão.

### 6.3. Timeline de Evolução Temporal (Replay de Orçamento)

A interface dispõe de um módulo de linha do tempo (*Evolution Explorer*) acoplado ao buffer histórico de auditoria. Esse recurso permite ao usuário pausar a recepção ao vivo e realizar um *replay* passo a passo (utilizando controles de reprodução ou *slider* manual) de todo o processo de busca do MCTS, tornando visível a dinâmica de convergência da árvore de decisão.

---

## 7. Modelos de Contratos de Dados (Esquemas)

Os esquemas abaixo ilustram os contratos de dados estritos transacionados via API, modelados com base nas especificações do Pydantic.

### 7.1. Estrutura de Entrada de Configuração (`ConfigParameters`)

```json
{
  "budgets": {
    "search": 120.0
  },
  "use_mock": false,
  "subgroups_to_explore": ["country", "device", "browser"],
  "subgroups_to_ignore": ["session_id"],
  "weights": {
    "quality": 1.0,
    "support": 0.5
  },
  "max_gap": 5,
  "gamma": 0.5,
  "min_support": 10,
  "min_count_class": 5,
  "uct_factor": 1.2,
  "jaccard_threshold": 0.3
}
```

### 7.2. Estrutura de uma Fatia Estatística (`Slice`)

```json
{
  "pattern_descriptor": "device=Mobile -> browser=Safari",
  "error_class_0": 0.154,
  "error_class_1": 0.723,
  "top10_avg_quality": 0.812,
  "top10_avg_support": 250.0,
  "soft_error": 0.08,
  "quality_score_phi": 0.897,
  "separation_sg": 0.569,
  "baseline_deviation_dgB": 3.42,
  "class_balance_bg": 0.78,
  "support_penalty_pgB": 1.24,
  "delta_g": 0.569,
  "mean_error_mu": 0.4385,
  "std_error_sigma": 0.052,
  "p_value_bh": 0.012,
  "support_count": 320,
  "support_percentage": 32.0,
  "search_metrics": {
    "explored_patterns": 142,
    "filtered_similarity": 0.18,
    "search_space_coverage": 0.45
  }
}
```

### 7.3. Estrutura de Snapshot de Auditoria (`AuditSnapshot`)

Representa o payload enviado em broadcast aos clientes WebSockets para representar o estado global do buscador em uma determinada iteração:

```json
{
  "id": "run-snapshot-14",
  "iteration": 14,
  "timestamp": "2026-06-03T09:48:39.123Z",
  "metadata": {
    "source": "mcts-engine"
  },
  "global_metrics": {
    "avg_error": 0.315,
    "tree_progress": 0.085,
    "top_quality": 0.942,
    "explored_nodes": 4250,
    "search_space": 50000,
    "explored_rate": 24.5,
    "stability": 3,
    "rollout_success_rate": 0.78,
    "global_errors_class_0": [0.1, 0.15, 0.2],
    "global_errors_class_1": [0.6, 0.65, 0.7],
    "uct_factor": 1.2,
    "support_penalty": 0.5,
    "max_gap": 5,
    "max_depth": 4,
    "total_elapsed_time": 45.2,
    "pareto_frontier": [
      [12.5, 0.942],
      [28.0, 0.812]
    ],
    "feature_importance": {
      "device": 45,
      "browser": 30,
      "country": 15
    },
    "depth_histogram": [1, 10, 45, 120, 14],
    "anytime_quality": [
      [5.0, 0.5],
      [10.0, 0.65],
      [45.2, 0.942]
    ],
    "path_diversity": 0.68,
    "search_space_diagnostics": {
      "dead_ends": 12,
      "pruned_nodes": 140
    }
  },
  "discovered_patterns": [
    {
      "id": "p1",
      "quality_score": 0.942,
      "attributes": {
        "support": 125,
        "complexity": 2.0,
        "separation": 0.575,
        "deviation": 0.403,
        "class_balance": 0.82,
        "support_penalty_pgB": 0.92,
        "delta_g": 0.575,
        "error_class_0": 0.12,
        "error_class_1": 0.695,
        "mean_error_mu": 0.407,
        "std_error_sigma": 0.048,
        "p_value_bh": 0.002,
        "support_percentage": 12.5,
        "wracc": 0.071875,
        "contrast_metric": 0.575,
        "efficiency": 0.02084
      },
      "example_slice": {
        "errors_class_0": [0.11, 0.13],
        "errors_class_1": [0.68, 0.71],
        "sequence": [
          { "itemset": ["device=Mobile"], "gap_before": 0 },
          { "itemset": ["browser=Safari"], "gap_before": 2 }
        ]
      }
    }
  ]
}
```

---

## 8. Mecanismo de Controle Humano-no-Loop (Human-in-the-Loop)

Um diferencial arquitetural do AuditLens reside no controle de malha fechada fornecido ao analista humano durante a execução da busca computacional. Este mecanismo opera através de duas diretivas de intervenção direta:

1.  **Ponderação Dinâmica de Prioridades**: O usuário pode clicar em qualquer nó de fatia descoberto na tela e injetar um "foco de peso" na API (`POST /api/control/focus`). Isso altera instantaneamente o dicionário de pesos de busca do orquestrador central. Em iterações futuras do MCTS, o motor prioriza ramos da árvore de decisão contendo a assinatura do padrão focado, intensificando a exploração local.
2.  **Injeção Dinâmica de Orçamento**: Quando a auditoria atinge o limite do orçamento consumido e entra em modo pausado, o analista pode "injetar" orçamento temporal adicional diretamente para subgrupos de interesse, permitindo a continuidade imediata da busca apenas em ramos específicos sem a necessidade de reiniciar o estado do buscador.

---

## 9. Conclusão

A arquitetura do **AuditLens** delineada neste documento apresenta uma abordagem estruturada e teoricamente fundamentada para o problema prático de auditoria empírica de desempenho de modelos. A modularidade do seu backend em FastAPI aliada à reatividade do seu frontend baseado no *Visualizer Registry Pattern* e na telemetria assíncrona WebSockets estabelecem um sistema escalável, robusto e perfeitamente adequado para integração com pipelines modernos de monitoramento e governança de inteligência artificial.
