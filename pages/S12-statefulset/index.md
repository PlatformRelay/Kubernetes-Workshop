---
layout: section-cover
image: /covers/section-12-luggage-caravan.webp
day: Day 2
section: '12'
tier: recommended
track: Workloads
---

# StatefulSet

Dê a cada réplica uma **identidade estável** e um storage **próprio** — para workloads
que não podem ser tratados como intercambiáveis.

**recommended** · sugerido para o Day 2 · trilha Workloads

<!--
Seção S12 — StatefulSet. Tempo: ~30 min de slides + 30 min de lab. Segue o S11 (Storage):
o S11 tornou os dados duráveis, mas um Deployment compartilha UM PVC entre todas as
réplicas. O S12 é a resposta quando cada réplica precisa da própria identidade E do
próprio volume.
Resultado: os participantes conseguem dizer quando um StatefulSet vence um Deployment;
explicar as três garantias (nomes ordinais estáveis, DNS por Pod estável via um headless
Service, PVCs por Pod a partir de volumeClaimTemplates); ler create/terminate ordenados e
rollout particionado; e provar que identidade + dados sobrevivem a um delete de Pod.
Beats: problema (Pods intercambiáveis são errados para identidade/dados) · modelo mental
(três garantias) · magic-move (headless Service clusterIP:None → StatefulSet serviceName +
volumeClaimTemplates) · animação StatefulIdentity (create ordenado → sentinela → delete de
web-1 → mesmo nome/PVC reanexados) · ciclo de vida ordenado + podManagementPolicy +
partition · pegadinha da retenção de PVCs (atualidade) · recap → lab.
Animação: StatefulIdentity.vue (nova, autocontida — a "animação manifest-extends" do AC
não tem componente existente; o S11 abriu o precedente de uma animação por seção).
CKx: workloads no CKAD/CKA — StatefulSets, headless Services, volumeClaimTemplates.
-->

---
layout: statement
kicker: O problema
---

Os Pods de um Deployment são **gado** — alguns workloads são **bichos de estimação**.

Um Deployment te dá `web-6f8c9b7d5-abcde`, `web-6f8c9b7d5-xk2mp` — nomes **aleatórios,
intercambiáveis**, e (da seção de storage) todos compartilham **um** PVC. Isso é perfeito
para uma camada web stateless. Mas uma réplica de banco de dados, um message broker ou um
cluster de cache precisa do oposto: um **nome estável** que ele mantém entre restarts, um
**endereço fixo** que seus pares conseguem encontrar, e um disco **próprio** que o segue.
Isso é um **StatefulSet**.

<!--
Speaker: o enquadramento gado-vs-bicho-de-estimação (cattle vs pets) é a entrada mais
rápida. Pods de Deployment são gado — você não os nomeia, qualquer um vale pelo outro, e
eles compartilham o destino. Os workloads que quebram sob esse modelo são os que carregam
identidade: um primary vs replica de Postgres, um broker Kafka com broker.id fixo, um
membro de etcd/ZooKeeper que os pares discam pelo nome. Três coisas de que eles precisam e
que um Deployment não dá: (1) um nome estável que sobrevive ao reagendamento, (2) um
endereço DNS estável para descoberta de pares, (3) seu próprio volume persistente, não um
compartilhado. Segure a resposta — o próximo slide nomeia as três garantias.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · três garantias que um Deployment não dá</span>

# StatefulSet = nome estável + DNS estável + storage próprio

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.85rem;">
  <v-click at="1">
    <div class="kw-icon-stack">
      <K8sIcon kind="sts" variant="unlabeled" size="3.4rem" class="kw-icon-stack-glyph" />
      <KwCard heading="Nomes ordinais estáveis" kind="sts">
        Os Pods são <code>web-0</code>, <code>web-1</code>… — criados <strong>em ordem</strong>,
        substituídos com o <strong>mesmo nome</strong>.
      </KwCard>
    </div>
  </v-click>
  <v-click at="2">
    <div class="kw-icon-stack">
      <K8sIcon kind="svc" variant="unlabeled" size="3.4rem" class="kw-icon-stack-glyph" />
      <KwCard heading="DNS estável por Pod" kind="svc">
        Headless Service → <code>web-0.web.&lt;ns&gt;.svc…</code> — os pares discam pelo nome.
      </KwCard>
    </div>
  </v-click>
  <v-click at="3">
    <div class="kw-icon-stack">
      <K8sIcon kind="pvc" variant="unlabeled" size="3.4rem" class="kw-icon-stack-glyph" />
      <KwCard heading="Storage por Pod" kind="pvc">
        <code>volumeClaimTemplates</code> → <code>data-web-0</code>, … — grudado ao ordinal.
      </KwCard>
    </div>
  </v-click>
</div>

<div v-click="4" class="mt-3 kw-muted text-sm">

O mesmo modelo de reconciliação — a garantia é <strong>identidade</strong>: ordinal → nome, DNS, volume.

</div>

</div>

<!--
Speaker: estas três são a seção inteira — tudo o mais é consequência.
(1) Nomes ordinais: o controller do StatefulSet numera os Pods 0..N-1 e um ordinal
deletado volta com o MESMO nome, não um aleatório novo. (2) DNS estável exige um Service
HEADLESS (clusterIP: None) — em vez de balancear para um IP virtual, o DNS retorna um
registro A por Pod, então web-0 consegue resolver web-1 pelo nome. É assim que software
clusterizado faz descoberta de pares. (3) volumeClaimTemplates é um *estêncil* de PVC: um
claim cunhado por ordinal, nomeado <template>-<statefulset>-<ordinal>, e ele NÃO é
deletado quando o Pod é (nem mesmo quando o StatefulSet é, por padrão). Reusa exatamente o
modelo PVC/StorageClass do S11 — a única ideia nova é "um por Pod, grudado ao ordinal."
Domínio de workloads do CKA/CKAD.
-->

---
layout: code-annotated
heading: 'Os quatro campos que fazem a identidade funcionar'
compact: true
lab: labs/day-2/12-statefulset.md
---

```yaml {none|5|6|9|11-12}
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: web, labels: { app: s12 } }
spec:
  serviceName: web
  replicas: 3
  selector: { matchLabels: { app: s12 } }
  template: { metadata: { labels: { app: s12 } }, spec: { containers: [...] } }
  volumeClaimTemplates:
    - metadata: { name: data }
      spec:
        accessModes: ['ReadWriteOnce']
        resources: { requests: { storage: 1Gi } }
```

::notes::

<CodeNote at="1" label="serviceName conecta o DNS" variant="warn">
Precisa nomear um Service <strong>headless</strong> (<code>clusterIP: None</code>). É isso
que dá a cada Pod <code>web-0.web.&lt;ns&gt;.svc…</code>. Aponte-o para um nome que não
existe e os Pods ainda iniciam — mas o DNS entre pares silenciosamente nunca resolve (o
quebre→conserte do lab).
</CodeNote>

<CodeNote at="2" label="réplicas são ordenadas">
O controller cria <code>web-0</code> → <code>web-1</code> → <code>web-2</code>
<strong>um por vez, em ordem</strong>, e os termina na ordem inversa.
</CodeNote>

<CodeNote at="3" label="volumeClaimTemplates ≠ volumes">
Não é uma entrada em <code>volumes:</code> — é um <strong>template</strong>. Cada ordinal
ganha seu próprio PVC <code>&lt;name&gt;-&lt;sts&gt;-&lt;ordinal&gt;</code>
(<code>data-web-0</code>, …), cada um provisionado dinamicamente exatamente como na seção
de storage.
</CodeNote>

<CodeNote at="4" label="o claim reusa o PVC de storage" variant="ok">
Mesmo modelo de <code>accessModes</code> + <code>resources</code> + StorageClass do PVC de
storage — a única ideia nova é <strong>um por Pod</strong>, grudado ao ordinal entre restarts.
</CodeNote>

<!--
Speaker: quatro campos carregam todo o comportamento. serviceName é o que as pessoas
esquecem — ele precisa referenciar um headless Service, e nada valida que o nome existe,
então um erro de digitação te dá Pods rodando com DNS de pares morto (uma quebra didática
ótima, é a do lab). replicas aqui se comporta diferente de um Deployment: ordenado, um por
vez. volumeClaimTemplates é a estrela — um estêncil, não um volume; o controller estampa
data-web-0/1/2 e reanexa o certo ao ordinal certo para sempre. O corpo do claim é
byte a byte idêntico ao PVC do S11, e esse é o ponto: nada de novo no storage, só um por
Pod. O spec do container foi omitido aqui por espaço — o lab carrega o manifesto aplicável
completo.
-->

---
layout: code-walkthrough
heading: 'Construa — um headless Service, depois o StatefulSet'
lab: labs/day-2/12-statefulset.md
---

````md magic-move
```yaml
# 1: um Service HEADLESS — clusterIP: None → DNS por Pod, não um IP virtual
apiVersion: v1
kind: Service
metadata: { name: web, labels: { app: s12 } }
spec:
  clusterIP: None                    # <-- headless: o DNS retorna cada Pod, sem balanceamento
  selector: { app: s12 }
  ports: [{ port: 80, targetPort: 8080, name: http }]
```

```yaml
# 2: o StatefulSet — referencia o Service pelo nome, réplicas sobem em ordem
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: web, labels: { app: s12 } }
spec:
  serviceName: web                   # o headless Service acima
  replicas: 3                        # web-0, web-1, web-2 — criados em ordem
  selector: { matchLabels: { app: s12 } }
  template:
    metadata: { labels: { app: s12 } }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          volumeMounts: [{ name: data, mountPath: /data }]
        - name: toolbox   # image da aplicação sem shell → o sidecar escreve o sentinela
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts: [{ name: data, mountPath: /data }]
```

```yaml
# 3: +volumeClaimTemplates — um PVC cunhado por ordinal (data-web-0, -1, -2)
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: web, labels: { app: s12 } }
spec:
  serviceName: web
  replicas: 3
  selector: { matchLabels: { app: s12 } }
  template:
    metadata: { labels: { app: s12 } }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          volumeMounts: [{ name: data, mountPath: /data }]   # o claim do template
        - name: toolbox
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts: [{ name: data, mountPath: /data }]
  volumeClaimTemplates:
    - metadata: { name: data }        # → data-web-0, data-web-1, data-web-2
      spec:
        accessModes: ['ReadWriteOnce']
        resources: { requests: { storage: 1Gi } }
```

````

<!--
Speaker: TRÊS frames. (1) o headless Service — a ÚNICA diferença de um Service ClusterIP
do S07 é clusterIP: None, e essa única linha muda o DNS de "um IP virtual" para "um
registro A por Pod." (2) o corpo do StatefulSet: serviceName o amarra àquele Service,
replicas:3 vai subir ordenado. Note o nome do mount `data` — ele ainda não tem uma entrada
volumes: correspondente, porque... (3) volumeClaimTemplates a fornece: o template chamado
`data` vira o PVC por ordinal (data-web-0…), e o volumeMount `data` do container resolve
para aquele claim por Pod. Essa é a fiação: nome do template == nome do volumeMount. Visão
de ensino compacta (metadata em linha); o lab entrega os arquivos aplicáveis em estilo de
bloco. O lab aplica exatamente estes.
-->

---

<span class="kw-kicker">Criação ordenada · sentinela · delete do web-1 · mesmo nome + PVC de volta</span>

# Identidade estável em movimento

<div class="mt-2">
  <StatefulIdentity :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- **`web-0` primeiro**, depois `web-1`, depois `web-2` — ordenado, não disparado de uma vez como um Deployment.
- Cada ordinal ganha seu **próprio** PVC (`data-web-N`) cunhado a partir de `volumeClaimTemplates`.
- Escreva um sentinela em **`web-1`** — ele cai em `data-web-1`, não no Pod.
- Delete `web-1`: seu PVC é um **objeto separado**, então os dados ficam onde estão.
- `web-1` volta com o **mesmo nome**, revincula o **mesmo PVC** — os dados sobreviveram.

</v-clicks>
</div>

<!--
Speaker: conduza com cliques. (0) o headless Service existe, sem Pods. (1) web-0 criado
PRIMEIRO, seu PVC data-web-0 cunhado. (2) web-1 e depois web-2, estritamente ordenados,
cada um com seu próprio PVC — contraste com um Deployment subindo todas as réplicas de uma
vez com nomes aleatórios e um claim compartilhado. (3) escreva um sentinela no volume de
web-1. (4) delete web-1 — seu PVC é um objeto separado e persiste. (5) web-1 volta com o
MESMO nome, revincula o MESMO PVC, sentinela intacto. Esse último frame é a proposta de
valor inteira e é exatamente o que o lab prova. Um Pod de Deployment, em contraste,
voltaria como web-<novohash> com um volume vazio (ou compartilhado).
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Ciclo de vida · ordenado, e como os rollouts diferem</span>

# Ordenado por padrão — e os botões que mudam isso

<div class="kw-cols-2 mt-2 text-sm">
  <v-click at="1">
    <KwCard heading="Criação & deleção ordenadas" icon="🔢">
      Escale para cima <code>web-0…N</code> <strong>em ordem</strong>; para baixo na ordem
      <strong>inversa</strong>. Rollouts substituem o ordinal mais alto primeiro.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="podManagementPolicy" icon="⚙️" variant="warn">
      <code>OrderedReady</code> (default) vs <code>Parallel</code> — mais rápido quando os
      pares não precisam de sequenciamento estrito.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="Rollout particionado" icon="🧪">
    <code>partition: N</code> atualiza os ordinais <strong>≥ N</strong> — canary embutido.
  </KwCard>
  <KwCard heading="O storage NÃO é limpo automaticamente" icon="🗑️" variant="danger">
    PVCs sobrevivem ao delete do StatefulSet por padrão — defina
    <code>persistentVolumeClaimRetentionPolicy</code> ou limpe manualmente.
  </KwCard>
</div>

</div>

<!--
Speaker: quatro fatos operacionais. (1) A ordenação é o contrato default — web-0 precisa
estar Ready antes de web-1 iniciar; no scale-down o ordinal mais alto sai primeiro. É isso
que permite a software clusterizado fazer bootstrap deterministicamente (seed node
primeiro, etc.). (2) podManagementPolicy: Parallel abre mão da ordenação quando você não
precisa do sequenciamento (não pode ser mudado depois da criação). (3) partition é o recurso
subestimado: é um canary nativo para aplicações stateful — fixe a partition alta, atualize
só o ordinal do topo, verifique, depois desça. (4) A pegadinha da limpeza e o beat de
atualidade: historicamente PVCs de volumeClaimTemplates NUNCA são deletados
automaticamente (default seguro, limpeza manual — o passo de cleanup do lab). A resposta
moderna é persistentVolumeClaimRetentionPolicy (whenDeleted/whenScaled: Retain|Delete),
agora GA — mencione para que ninguém pense que deletar na mão é a única opção. Lab: o
cleanup deleta os PVCs por label.
-->

---
layout: recap
heading: 'Recap — workloads com identidade'
story: 'Deletar o web-1 pareceu catastrófico até ele voltar com o mesmo nome e o mesmo sentinela em data-web-1 — identidade e disco continuaram acoplados.'
next: 'Resources & limits — dimensione o que você roda (requests, limits, QoS)'
---

- Pods de **Deployment** = intercambiáveis, nomes aleatórios, PVC **compartilhado** —
  errado para identidade ou dados por instância
- **StatefulSet** = **nomes ordinais estáveis** (`web-0…`) + **DNS estável por Pod** (headless
  Service: `clusterIP: None` + `serviceName`) + **PVCs por Pod** (`volumeClaimTemplates`)
- `volumeClaimTemplates` cunha **um PVC por ordinal** (reusa o PVC de storage), **grudado** entre restarts
- Criação/deleção ordenadas (`OrderedReady`; `Parallel` dispensa a ordem); `partition` = **canary** embutido
- Delete um Pod → **mesmo nome + mesmo PVC** → os dados sobrevivem; PVCs **não** são deletados
  automaticamente (limpe, ou defina `persistentVolumeClaimRetentionPolicy`)

<!--
Speaker: o takeaway de hora de incidente: "busque um StatefulSet quando o nome, o endereço
ou o disco de um Pod precisam ser estáveis — caso contrário um Deployment é mais simples e
mais barato." Duas armadilhas a nomear: o serviceName precisa apontar para um headless
Service real ou o DNS entre pares morre silenciosamente (a quebra do lab), e PVCs
esquecidos custam dinheiro porque sobrevivem ao StatefulSet. Passe ao Lab 12: aplicar o
headless Service + StatefulSet, ver web-0/1/2 aparecerem em ordem, confirmar um PVC por
ordinal, escrever um sentinela em web-1, deletá-lo e provar a volta com mesmo nome +
mesmos dados; depois quebrar o serviceName e ver o DNS entre pares falhar. A próxima seção
(S13) pivota de identidade para dimensionamento: requests, limits e QoS.
-->

---
layout: lab
lab: labs/day-2/12-statefulset.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 12 — Identidade estável

- Aplique um **headless Service** (`clusterIP: None`) e depois um **StatefulSet de 3 réplicas** com
  `volumeClaimTemplates`; veja `web-0`, `web-1`, `web-2` aparecerem **em ordem**
- Confirme **um PVC por ordinal** (`data-web-0/1/2`); entre com `exec` no `web-1` e escreva um
  **sentinela**
- **Delete o `web-1`** → ele volta com o **mesmo nome**, revincula o **mesmo PVC**, sentinela
  intacto
- **Quebre→conserte:** aponte `serviceName` para um Service inexistente → o DNS por Pod nunca resolve →
  diagnostique de outro Pod → conserte e veja `web-1.web` resolver
- Responda a manchete: *por que o `web-1` reanexou seus dados enquanto um Pod de Deployment não o faria?*
