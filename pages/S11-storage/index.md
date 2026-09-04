---
layout: section-cover
image: /covers/section-11-luggage-depot.webp
day: Day 2
section: '11'
tier: core
track: Workloads
---

# Storage (PV/PVC/StorageClass)

Dê à aplicação um volume que sobrevive ao Pod — e raciocine sobre a pilha de storage
que o provisiona.

**core** · sugerido para o Day 2 · trilha Workloads

<!--
Seção S11 — Storage. Tempo: ~30 min de slides + 30 min de lab. Segunda preocupação de
workload do Day 2 depois da config (S10): a aplicação está configurável, mas seus DADOS
ainda são efêmeros.
Resultado: os participantes conseguem distinguir storage efêmero (fs do container /
emptyDir) de durável, explicar a cadeia PVC → PV → StorageClass e o provisionamento
dinâmico, escolher um access mode e uma reclaim policy, e montar um PVC provisionado
dinamicamente em um Deployment para que os dados sobrevivam a um delete de Pod.
Beats: problema (fs + emptyDir são efêmeros) · modelo mental (PVC=pedido → PV=storage →
StorageClass=provisioner) · access modes + reclaim policy · magic-move (emptyDir → PVC
referenciando uma StorageClass, montado) · animação de binding do PVC (bind → escrita →
delete do Pod → os dados sobrevivem) · provisionamento + binding mode
(WaitForFirstConsumer; Deployments também montam PVCs → prepara o S12) · recap → lab.
Animação compartilhada opcional: PvcBinding.vue (nova, autocontida). CKx: storage no
CKA/CKAD — PV, PVC, StorageClass, access modes, reclaim policy, provisionamento dinâmico.
-->

---
layout: statement
kicker: O problema
---

O filesystem de um container **morre com o Pod**.

Escreva um arquivo dentro de um container em execução e ele vive na camada gravável do
Pod — delete o Pod, reagende-o, ou deixe um Deployment substituí-lo, e esses dados
**se foram**. `emptyDir` é pouco melhor: sobrevive a um *restart* de container, mas é
apagado quando o Pod é removido. Qualquer coisa que precise **sobreviver ao Pod** — um
banco de dados, um upload, um cache que você não pode perder — precisa de storage que
seja um **objeto separado do Pod**.

<!--
Speaker: torne a falha concreta — este é o equivalente de storage da lição de config do
S10 (a image é imutável; a config vive fora dela). Aqui: o Pod é descartável; dados que
importam precisam viver fora dele. Dois níveis efêmeros a nomear: (1) a própria camada
gravável do container — some no delete do Pod E é zerada no restart do container;
(2) emptyDir — um volume vazio que compartilha o tempo de vida do Pod, sobrevive a um
crash/restart de container mas é deletado com o Pod. Nenhum dos dois sobrevive a um
reagendamento. O Lab 11 prova durabilidade contra um delete de Pod de verdade.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · pedido, storage, provisioner</span>

# Três objetos: PVC → PV → StorageClass

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.85rem;">
  <v-click at="1">
    <div class="kw-icon-stack">
      <K8sIcon kind="pvc" variant="unlabeled" size="3.4rem" class="kw-icon-stack-glyph" />
      <KwCard heading="PersistentVolumeClaim" kind="pvc">
        O <strong>pedido</strong>: tamanho + access mode. Vive no namespace ao lado do Deployment.
      </KwCard>
    </div>
  </v-click>
  <v-click at="2">
    <div class="kw-icon-stack">
      <K8sIcon kind="pv" variant="unlabeled" size="3.4rem" class="kw-icon-stack-glyph" />
      <KwCard heading="PersistentVolume" kind="pv">
        O <strong>storage</strong> de fato — escopo de cluster, vinculado 1:1 a um claim.
      </KwCard>
    </div>
  </v-click>
  <v-click at="3">
    <div class="kw-icon-stack">
      <div class="kw-icon-stack-glyph" style="font-size:2.8rem;line-height:1;">⚙️</div>
      <KwCard heading="StorageClass" icon="🏭">
        O <strong>provisioner</strong> + o sabor de disco — cria o PV dinamicamente.
      </KwCard>
    </div>
  </v-click>
</div>

<div v-click="4" class="mt-3 kw-muted text-sm">

Você escreve o **PVC**. A **StorageClass** provisiona um **PV** correspondente e os
vincula. O Pod monta o claim pelo nome.

</div>

</div>

<!--
Speaker: crave o fluxo de mão única — você é autor apenas do PVC (o pedido). Todo o resto
é automático sob provisionamento dinâmico: a StorageClass nomeada roda um provisioner que
cunha um PV do tamanho do claim e os vincula 1:1. O provisionamento estático (um admin
pré-cria PVs) ainda existe, mas hoje é a exceção. Analogia que gruda: PVC = uma ordem de
serviço, PV = a mercadoria entregue, StorageClass = o fornecedor/catálogo. Não existe
glifo oficial para StorageClass no conjunto de ícones, então ela aparece como uma
engrenagem — pv/pvc usam os glifos oficiais dos recursos. Lab: aplicar um PVC contra a
StorageClass default e ver o PV aparecer.
-->

---
layout: code-annotated
heading: 'Access modes e reclaim policy — os dois botões que mordem'
compact: true
lab: labs/day-2/11-storage.md
---

```yaml {none|4|5-6|7|all}
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: web-data, labels: { app: s11 } }
spec:
  storageClassName: standard        # qual provisioner / sabor de disco
  accessModes: ['ReadWriteOnce']    # RWO · RWX · ReadWriteOncePod
  resources: { requests: { storage: 1Gi } }
```

::notes::

<CodeNote at="1" label="nome da StorageClass">
Nomeia o provisioner. Omita-o e você recebe a StorageClass <strong>default</strong> do
cluster; nomeie uma que não existe e o claim fica pendurado em <code>Pending</code> para
sempre (o quebre→conserte do lab).
</CodeNote>

<CodeNote at="2" label="access mode = quantos nodes" variant="warn">
<code>ReadWriteOnce</code> = um <strong>node</strong> monta em leitura-escrita (a maioria
dos discos de bloco). <code>ReadWriteMany</code> = muitos nodes ao mesmo tempo (exige um
filesystem compartilhado como NFS). <code>ReadWriteOncePod</code> = exatamente um Pod.
Escolher RWO é o default comum — só saiba que ele prende o Pod a um node.
</CodeNote>

<CodeNote at="3" label="o tamanho é um pedido">
O provisionamento dinâmico cria um PV de pelo menos este tamanho. Você pode crescer um PVC
depois se a StorageClass permitir <code>allowVolumeExpansion</code>.
</CodeNote>

<CodeNote at="4" label="a reclaim policy vive no PV" variant="ok">
O <code>persistentVolumeReclaimPolicy</code> do PV vinculado decide o que acontece no
delete do PVC: <code>Delete</code> (default para PVs dinâmicos — disco destruído) ou
<code>Retain</code> (PV + dados mantidos para recuperação manual).
</CodeNote>

<!--
Speaker: dois botões causam a maior parte da confusão de storage. (1) Access mode é sobre
NODES, não um lock — RWO significa que um node o monta, então um Deployment multi-réplica
em RWO pode encurralar Pods em um node ou bloquear um rollout. RWX exige um filesystem
compartilhado de verdade. RWOP (1.22+, GA na 1.29) é exclusivo de um Pod. (2) A reclaim
policy fica no PV e é o motivo de "deletar o PVC" poder ser destrutivo: PVs dinâmicos
default para Delete, então remover o claim remove o disco. Retain mantém os dados mas te
deixa um PV Released para limpar na mão. Ambos são observações do lab. O claim mostrado
aqui é exatamente o que o lab aplica.
-->

---
layout: code-walkthrough
heading: 'Estenda a aplicação — de emptyDir a um PVC durável'
lab: labs/day-2/11-storage.md
---

````md magic-move
```yaml
# nossa aplicação web — os dados vivem em um emptyDir: somem quando o Pod é removido
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s11 } }
spec:
  selector: { matchLabels: { app: s11 } }
  template:
    metadata: { labels: { app: s11 } }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          volumeMounts:
            - { name: data, mountPath: /data }
        - name: toolbox   # image da aplicação sem shell → nossa caneta para /data (como no Lab 10)
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - { name: data, mountPath: /data }
      volumes:
        - name: data
          emptyDir: {}                       # efêmero — compartilha o tempo de vida do Pod
```

```yaml
# +1: um PVC — o pedido de storage durável (um objeto próprio)
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: web-data, labels: { app: s11 } }
spec:
  storageClassName: standard                 # provisioner default do cluster
  accessModes: ['ReadWriteOnce']
  resources: { requests: { storage: 1Gi } }
```

```yaml
# +2: o MESMO Deployment — troque emptyDir pelo claim, mount inalterado
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s11 } }
spec:
  selector: { matchLabels: { app: s11 } }
  template:
    metadata: { labels: { app: s11 } }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          volumeMounts:
            - { name: data, mountPath: /data }    # o container nem fica sabendo
        - name: toolbox
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - { name: data, mountPath: /data }
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: web-data }   # durável, sobrevive ao Pod
```

````

<!--
Speaker: TRÊS frames, a mesma aplicação ganhando storage durável. (1) emptyDir montado em
/data — o container escreve feliz, mas os dados compartilham o tempo de vida do Pod. (2)
um PVC como objeto PRÓPRIO — o pedido; note que ele é namespaced e etiquetado app: s11
como todo o resto. (3) o volume do Deployment vira de emptyDir para
persistentVolumeClaim.claimName — o spec do container e o mountPath são IDÊNTICOS, só a
fonte do volume mudou. Esse é o truque inteiro: o storage é plugável atrás do mount. O
sidecar toolbox vem do Lab 10: a image da aplicação é distroless, então o busybox é a
caneta que escreve o sentinela. Visão de ensino compacta (metadata em linha) — os
manifestos do lab carregam os originais aplicáveis em estilo de bloco. O lab aplica
exatamente estas peças, escreve um sentinela em /data (via toolbox) e deleta o Pod.
-->

---
clicks: 3
---

<span class="kw-kicker">Veja o bind · os dados sobrevivem a um delete de Pod</span>

# O PVC vincula, o Pod vai e vem

<div class="mt-4">
  <PvcBinding :step="$clicks" />
</div>

<!--
Speaker: conduza a animação com cliques (`clicks: 3` — sem isso o slide não tem outro
clicável e avança embora enquanto `$clicks` fica em 0). (0) O PVC está Pending — com uma
StorageClass WaitForFirstConsumer (o default local-path do kind) o binding espera por um
Pod, então Pending aqui é NORMAL, não uma falha. (1) O Pod é agendado → o provisioner
cunha um PV → o PVC vai a Bound → o container escreve o data.txt. (2) Delete o Pod: o PVC
e o PV são objetos separados com seu próprio ciclo de vida, então eles e os dados
persistem. (3) O Deployment recria o Pod; ele revincula o MESMO claim e o arquivo ainda
está lá. Esta é precisamente a prova central do lab — destaque isso para que os
participantes saibam como é o "correto" antes de executarem.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Provisionamento dinâmico · e uma ponte para StatefulSets</span>

# Quem cria o PV — e quando ele vincula

<div class="kw-cols-2 mt-2 text-sm">
  <v-click at="1">
    <KwCard heading="Provisionamento dinâmico" icon="🏭">
      O provisioner da StorageClass cria um PV <strong>sob demanda</strong> quando seu PVC
      aparece — a norma em clusters gerenciados e no kind.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="volumeBindingMode" icon="⏳" variant="warn">
      <code>Immediate</code> vincula na hora.
      <code>WaitForFirstConsumer</code> fica <strong>Pending até um Pod ser agendado</strong>
      — Pending ≠ quebrado.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="Deployments também montam PVCs" icon="📦">
    Bom para uma réplica ou <code>ReadWriteMany</code> — desajeitado quando muitas réplicas
    RWO precisam de discos separados.
  </KwCard>
  <KwCard heading="→ StatefulSet: storage por Pod" icon="🔢" variant="ok">
    <code>volumeClaimTemplates</code> cunha um PVC por Pod — isso é o próximo.
  </KwCard>
</div>

</div>

<!--
Speaker: duas coisas a assentar antes do lab e antes do S12. (1) volumeBindingMode explica
o comportamento Pending-e-depois-vincula que a animação acabou de mostrar —
WaitForFirstConsumer adia o binding até o agendamento para que um disco restrito por
topologia (ex.: um volume EBS zonal) se anexe ao node em que o Pod realmente cai. É por
isso que o lab diz aos usuários de kind que Pending é esperado até o Deployment ser
aplicado. (2) A ponte para o S12: um Deployment pode montar um PVC, mas todas as réplicas
compartilham aquele ÚNICO claim — ótimo para um único escritor, errado para N instâncias
stateful independentes. Essa lacuna é exatamente o que StatefulSet + volumeClaimTemplates
preenche, e ele reusa este mesmo modelo PVC/StorageClass. O domínio de storage do CKA/CKAD
cai aqui.
-->

---
layout: recap
heading: 'Recap — dados que sobrevivem ao Pod'
story: 'O arquivo sentinela sobreviveu a um delete de Pod porque o PVC sobreviveu ao Pod — o storage tem seu próprio ciclo de vida.'
compact: true
next: 'StatefulSet — identidade estável + storage por Pod (volumeClaimTemplates)'
---

- O filesystem do container e o **`emptyDir`** são **efêmeros** — somem quando o Pod é
  removido; dados duráveis precisam de um objeto com seu **próprio ciclo de vida**
- **PVC → PV → StorageClass:** você escreve o **claim**, a StorageClass **provisiona** um
  **PV** correspondente sob demanda e o vincula 1:1; o Pod monta o PVC pelo nome
- **Access mode** = quantos **nodes** o montam (`ReadWriteOnce` / `ReadWriteMany` /
  `ReadWriteOncePod`); a **reclaim policy** no PV (`Delete` vs `Retain`) decide se o
  disco morre com o claim
- **`volumeBindingMode: WaitForFirstConsumer`** mantém um PVC **Pending até um Pod ser
  agendado** — normal, não uma falha
- Trocar `emptyDir` → `persistentVolumeClaim` deixa o mount do container **inalterado** —
  o storage é plugável atrás do mount
- A seguir: dê a cada réplica sua **própria** identidade e volume com um **StatefulSet**

<!--
Speaker: o takeaway que vão buscar em um incidente: "meus dados sumiram" é quase sempre
storage efêmero (emptyDir ou a camada do container), e "meu PVC está preso em Pending" é
geralmente WaitForFirstConsumer esperando por um Pod — ou um erro de digitação no nome da
StorageClass (a quebra do lab). Depois pivote para o S12: tornamos os dados duráveis, mas
um Deployment compartilha um claim entre as réplicas; workloads com identidade precisam de
um volume cada. Passe o bastão para o Lab 11: vincular um PVC, escrever um sentinela,
deletar o Pod e provar que o arquivo sobrevive.
-->

---
layout: lab
lab: labs/day-2/11-storage.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 11 — Dados que sobrevivem

- Aplique um **PVC** contra a **StorageClass** default; veja-o vincular quando um Pod o consumir
- Monte-o em um **Deployment**, entre com `exec` e escreva um arquivo **sentinela**
- **Delete o Pod**, deixe o Deployment recriá-lo e confirme que o arquivo **sobreviveu**
- **Quebre→conserte:** peça uma StorageClass que não existe → PVC preso em `Pending` → diagnostique
  com `describe pvc` → conserte e veja-o vincular
- Responda a manchete: *por que o arquivo sobreviveu a um delete de Pod mas não a `kubectl delete pvc`?*
