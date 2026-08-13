---
layout: section-cover
image: /covers/section-27-sailing-on.webp
day: Day 3
section: '27'
tier: core
track: Wrap
---

# Wrap-up & próximos passos

Uma "linha vermelha" (red line), uma dúzia de camadas — e um mapa de para onde ir a partir daqui.

**core** · sugerido para o Day 3 · trilha Wrap

<!--
Seção S27 — Wrap-up & próximos passos. Só slides (sem lab). Tempo: ~20 min.
Resultado: os participantes saem com um modelo mental coerente (a red line + toda camada pendurada
nela) e um caminho concreto e vendor-neutral à frente (docs, aprendizado comunitário, playgrounds e
CKAD/CKA como um objetivo OPCIONAL).
Beats: fechar o arco da promessa do S00 · recap da espinha da red line (Pod → Deployment → Service → Ingress →
Gateway API + conceitos em camadas) · recap das camadas do Day 2/3 · tabela de alinhamento CKAD/CKA (enquadrada como
um DESIGN CHECK, não preparação para prova — o artefato explícito de design-check) · o que pulamos e onde
isso vive (service mesh / multi-cluster / admin-ops — apenas ponteiros) · mapa de recursos gratuitos (oficiais +
comunidade + playgrounds, SEM endosso de vendor) · CKAD/CKA como passo opcional seguinte +
feedback/contribuição · encerramento.
Guardrail: SEM endosso de vendor no slide do mapa de recursos; nomeie o oficial/comunidade/categoria, não
um produto comercial. Esta é a ÚLTIMA seção — o slide final é uma declaração de encerramento, NÃO um handoff
de lab (não existe lab).
Vínculo com CKx: a tabela de alinhamento CKAD/CKA É o artefato de design-check.
-->

---
layout: statement
kicker: Onde começamos, onde estamos
---

Três dias atrás a pergunta era **"o que é um container?"** Agora você consegue **escrever, rodar e operar** workloads centrais do Kubernetes — e ler os que você não escreveu.

O curso inteiro foi **uma red line** com todo o resto pendurado nela. Vamos redesenhá-la, nomear o que se somou em camadas e apontar para onde ir em seguida.

<!--
Speaker: feche o arco do beat "Por que estamos aqui" do S00 — a promessa 50/50 era levá-los de "o que é um
container" a escrever/rodar/operar workloads com confiança. Assente que agora isso é verdade: eles
construíram a espinha um manifesto por vez e sobrepuseram config, storage, health, security e delivery
por cima. Esta seção é um recap + um mapa, não conteúdo novo — respire, dê um zoom out e depois despache-os.
-->

---
layout: recap
heading: 'A red line — um manifesto que cresceu a semana inteira'
story: 'Um único Pod virou um Deployment, ganhou um endereço estável de Service, foi exposto por Ingress e depois modernizado para a Gateway API — cada passo estendeu o mesmo manifesto, então o fio condutor esteve sempre visível.'
---

<div class="flex items-center gap-3 text-lg mt-2">
  <K8sIcon kind="pod" /> <strong>Pod</strong> <span class="kw-muted">→</span>
  <K8sIcon kind="deploy" /> <strong>Deployment</strong> <span class="kw-muted">→</span>
  <K8sIcon kind="svc" /> <strong>Service</strong> <span class="kw-muted">→</span>
  <K8sIcon kind="ing" /> <strong>Ingress</strong> <span class="kw-muted">→</span>
  <span class="text-2xl">🚪</span> <strong>Gateway API</strong>
</div>

- **Pod** a menor unidade implantável → **Deployment** se autocura & faz rollout → **Service** um endereço estável para Pods que mudam → **Ingress** HTTP vindo de fora → **Gateway API** o sucessor moderno e orientado a papéis
- Pendurado nessa espinha: **ConfigMap/Secret**, **storage** & **StatefulSet**, **resources**, **health probes**, **Jobs/CronJobs**, **autoscaling**
- A única ideia por trás de tudo: **declare o desired state; um controller reconcilia a realidade para casar com ele**

<!--
Speaker: percorra os ícones da esquerda para a direita — esta é a espinha que todo participante viu crescer na barra
de progresso do rodapé. Cada recurso ESTENDEU o manifesto anterior (pod.yaml → deployment.yaml → +service
→ +ingress → gateway), e é por isso que se lê como uma linha só, não cinco tópicos. Depois nomeie as camadas
que se prenderam ao workload em execução: config/secrets, storage + identidade stateful, requests/limits de
resources, as três probes, batch e o HPA. Encerre no loop de reconciliação do S03 — o único
modelo mental que torna tudo isso uma ideia só, e o loop que eles encontraram uma terceira vez em GitOps/operators.
-->

---
layout: agenda
kicker: Tudo o que se somou em camadas
heading: 'Days 2–3 — opere como produção'
columns: 2
---

- **Fundamentos de security** — images pequenas e não-root, pod security & PSS, um **pod escape** controlado bloqueado pelo `restricted`
- **Network & identidade** — **NetworkPolicy** default-deny, identidades **RBAC** de least-privilege
- **Packaging & delivery** — releases templatizados com **Helm**, **GitOps** com Argo CD reconciliando a partir do Git
- **Estendendo o Kubernetes** — o **operator pattern**, o **Prometheus Operator** para observability, construir um com **kubebuilder**
- **Prontidão para produção** — o **capstone de best practices**: probes, PDBs, digests, NetworkPolicy, graceful shutdown, tudo como um checklist só

<div class="mt-4 kw-muted text-sm" v-click>

O mesmo loop de reconciliação, três vezes: controllers nativos, o **Git** como desired state e o **seu próprio CRD** como desired state.

</div>

<!--
Speaker: este é o slide "olha o quanto você avançou" — a red line foi o Day 1; os Days 2–3 a tornaram
operável e segura. Agrupe as camadas para virarem cinco ideias, não uma dúzia: security (image → pod → a
demo de escape que provou por que o restricted importa), network+identidade (netpol + rbac), delivery
(helm + gitops), extensão (operators + prometheus + kubebuilder) e o capstone que amarra tudo
num único checklist revisável. Faça o callback do motivo "o loop três vezes" — é a coisa mais
reutilizável que eles aprenderam. Note que o S24 (kubebuilder) é o aprofundamento opcional para quem quer
CONSTRUIR um operator, não apenas consumir um.
-->

---

<span class="kw-kicker">Um design check, não preparação para prova</span>

# Os domínios do CKAD/CKA são na verdade um **checklist de design**

<div class="kw-slide-dense text-[0.7rem] leading-snug mt-1 grid grid-cols-2 gap-x-6 gap-y-1.5">

<div>
  <div class="font-semibold opacity-80 mb-0.5">CKAD</div>
  <div><strong>Design & build</strong> — containers, ciclo de vida do Pod, Jobs</div>
  <div><strong>Deployment</strong> — Deployments, Helm, GitOps</div>
  <div><strong>Observability</strong> — probes, resources, Prometheus</div>
</div>

<div>
  <div class="font-semibold opacity-80 mb-0.5">CKAD + CKA</div>
  <div><strong>Config & security</strong> — CM/Secret, PSS, RBAC, digests</div>
  <div><strong>Services & rede</strong> — Service, Ingress, Gateway, NetPol</div>
</div>

<div>
  <div class="font-semibold opacity-80 mb-0.5">CKA</div>
  <div><strong>Arquitetura</strong> — control plane, kubectl, RBAC</div>
  <div><strong>Storage</strong> — PV/PVC/StorageClass, StatefulSet</div>
</div>

<div>
  <div class="font-semibold opacity-80 mb-0.5">CKA · Troubleshooting</div>
  <div>O passo deliberado de <strong>quebrar → consertar</strong> de cada lab</div>
</div>

</div>

<div class="mt-2 kw-muted text-xs" v-click>

Leia como *"meu workload consegue responder a cada um destes?"* — não como uma ementa para decorar.

</div>

<!--
Speaker: enquadre com cuidado — isto NÃO é "aqui está como passar na prova". Os domínios da certificação
por acaso são um checklist de prontidão para produção bem organizado, e este workshop cobriu quase tudo
isso ensinando design, não técnica de prova. Aponte que troubleshooting é o único domínio que não dá para
ensinar em slide — que é exatamente por que cada lab teve um quebrar→consertar. Se alguém quiser a cert, o
mapa mostra que já encontrou o material; o próximo passo é prática cronometrada, não conceitos novos.
-->

---

<span class="kw-kicker">Honestos sobre as bordas</span>

# O que pulamos — e onde isso vive

<div class="kw-cols-3 mt-4 text-sm">
  <KwCard heading="Service mesh" icon="🕸️">
    mTLS, traffic-splitting e política L7 entre services. A Gateway API
    é a rampa de entrada; um mesh é a próxima camada quando segurança service-to-service e
    roteamento de granularidade fina viram o problema.
  </KwCard>
  <KwCard heading="Multi-cluster & escala" icon="🌍">
    Federação, gestão de frota e entrega cross-region. O GitOps é a
    fundação sobre a qual o tooling de multi-cluster se constrói.
  </KwCard>
  <KwCard heading="Operação de cluster" icon="🛠️" variant="plain">
    Rodar o próprio control plane: upgrades, backup/restore do etcd, ciclo de vida
    de node, capacidade. Uma <strong>trilha de admin/operations</strong> inteira por
    conta própria — este workshop foi o lado dos <em>workloads</em>.
  </KwCard>
</div>

<div class="mt-5 kw-muted text-sm" v-click>

Estes são ponteiros, não lacunas para fechar hoje — cada um é um próximo curso deliberado, e cada um se apoia em algo que você já construiu aqui.

</div>

<!--
Speaker: seja honesto de que um workshop de 3 dias não cobre tudo, e nomeie as grandes omissões para que
ninguém ache que terminou de vez. Service mesh (aqui ensinamos workloads + Gateway API, não meshing com mTLS);
multi-cluster/frota (single-cluster aqui, mas o GitOps é a primitiva sobre a qual se constrói);
e administração de cluster — o mundo "instalar & configurar o control plane" do CKA, que é uma
disciplina separada de escrever workloads. Enquadre cada um como "você já tem a fundação para
isto", para que soe como um mapa à frente, não uma confissão de buracos.
-->

---

<span class="kw-kicker">Para onde ir em seguida · gratuito & vendor-neutral</span>

# Um mapa para os próximos 90 dias

<div class="kw-cols-3 mt-4 text-sm">
  <KwCard heading="Leia a fonte da verdade" icon="📚">
    A <strong>documentação oficial do Kubernetes</strong> — Concepts, Tasks e
    os Tutorials interativos. O hábito do <code>kubectl explain</code> é a
    documentação dentro do seu terminal.
  </KwCard>
  <KwCard heading="Aprendizado estruturado" icon="🧭">
    Treinamentos comunitários da <strong>CNCF / Linux Foundation</strong> e as
    trilhas de aprendizado mantidas pelos projetos — vendor-neutral, e são os mesmos órgãos por trás do
    CKAD/CKA.
  </KwCard>
  <KwCard heading="Quebre coisas com segurança" icon="🧪" variant="plain">
    <strong>Playgrounds</strong> baseados em navegador e um cluster <strong>kind</strong>
    local — o mesmo ambiente descartável de todo lab. Mantenha o
    hábito de quebrar → consertar.
  </KwCard>
</div>

<div class="mt-5 text-sm" v-click>

O próximo passo de maior alavancagem não é um curso — é **rodar um workload real através do checklist de best practices**. Este deck inteiro e seus labs são seus para guardar e reexecutar.

</div>

<!--
Speaker: GUARDRAIL — mantenha isto vendor-neutral. Nomeie categorias e as fontes oficiais/comunitárias,
nunca promova um produto comercial específico ou plataforma paga. Três baldes: (1) a documentação oficial
é genuinamente a melhor referência, e o kubectl explain é essa documentação offline; (2) treinamentos comunitários da CNCF /
Linux Foundation e trilhas de aprendizado dos projetos são gratuitos e neutros; (3) playgrounds hands-on
+ o próprio cluster kind deles para continuar praticando. Assente o conselho real: a melhor próxima ação
é aplicar o checklist do capstone a algo que eles de fato rodam — o deck + os labs são abertos e
deles para guardar.
-->

---
layout: comparison
heading: 'CKAD / CKA — um objetivo opcional, não o ponto'
leftHeading: 'Se uma certificação te ajuda'
rightHeading: 'Se não ajuda'
leftBadge: opcional
rightBadge: também tudo bem
---

- Um **prazo e uma ementa** podem ser motivadores — e você já encontrou a maior parte do material (veja o mapa).
- A lacuna a fechar é **velocidade sob pressão de tempo**, não conceitos novos: prática cronometrada, fluência em `kubectl` e a documentação que você pode usar na prova.
- O **CKAD** pende para escrever workloads; o **CKA** adiciona administração de cluster (a trilha de operações que sinalizamos).

::right::

- As habilidades são o objetivo; o selo é opcional. Nada aqui precisa de uma cert para ser útil.
- **Operar bem um serviço real** — probes, limits, least privilege, GitOps, um checklist que você faz valer — vale mais do que qualquer prova.
- Volte aos labs sempre que topar com um tópico na vida real; eles foram feitos para serem reexecutados.

<!--
Speaker: desarme a ansiedade com certificação. Posicione CKAD/CKA como UM caminho opcional, não o destino — algumas
pessoas se motivam com um objetivo e uma data, e tudo bem; outras não precisam, também tudo bem. O
ponto técnico honesto: eles já têm os conceitos (a tabela de alinhamento prova), então a
única lacuna real de preparação é velocidade cronometrada e memória muscular de kubectl, ambas prática e não aprendizado. CKAD =
autor de workloads; CKA = + admin de cluster. De todo jeito, o ganho transferível é operar bem workloads reais.
-->

---
layout: statement
kicker: Este é um workshop aberto — deixe-o melhor
---

# Obrigado — agora vá quebrar coisas (com segurança)

Você começou em *"o que é um container"* e agora consegue **escrever, rodar, proteger, entregar e operar** workloads Kubernetes. Essa era a promessa inteira.

<div class="mt-4 text-sm">

- **Feedback & contribuições são bem-vindos** — este deck e seus labs são **open source**. Abra uma issue ou um PR: um passo confuso, um quebrar→consertar melhor, uma seção que você adicionaria.
- **Mantenha o ritmo:** explique → rode → **observe → quebre → conserte** → recap. Funciona fora desta sala também.
- **Tudo é seu para guardar** — os slides, cada lab e o checklist de produção de best practices.

</div>

<div class="mt-5 kw-muted">Até o próximo loop de reconciliação. 🚀</div>

<!--
Speaker: o encerramento. Reafirme a promessa do S00 como cumprida — de novato em containers a operador de workloads em
três dias. Convide contribuição real: é um workshop open-source e vendor-neutral, e as melhores
melhorias vêm de participantes que acabaram de bater nas arestas (nomeie convites concretos — um
passo confuso, um quebrar→consertar melhor, uma seção faltando). Despache-os com o ritmo de ensino como
hábito portátil e o lembrete de que o kit inteiro é deles. Termine com calor — sem handoff de lab, este é o
slide final do curso.
-->
