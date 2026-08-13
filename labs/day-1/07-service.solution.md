# Lab 07 — Service (S07) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 1 — exponha o Deployment

O `selector` do Service é o **mesmo label** que o Deployment carimba em seus Pods
(`app: web`). Esse casamento de label é toda a fiação.

```bash
cat > service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web
  labels:
    app: web
spec:
  selector:
    app: web            # seleciona todo Pod que carrega este label
  ports:
    - name: http
      port: 80          # a porta do Service — o que os clientes acessam
      targetPort: 8080  # a porta do container (containerPort no Pod)
EOF

kubectl apply -f service.yaml
kubectl get service web
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get service web
NAME   TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
web    ClusterIP   10.96.142.51    <none>        80/TCP    5s
```

`ClusterIP` é o tipo padrão: um IP virtual estável **interno ao cluster**. Ele nunca muda,
mesmo com os Pods atrás dele indo e vindo — que é exatamente a razão de Services existirem
(IPs de Pod são efêmeros, como você viu quando o ReplicaSet alternou os Pods no Lab 06).
</details>

---

### Step 2 — veja os endpoints que o selector produziu

```bash
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl get pods -l app=web -o wide
```

**Tarefa:** quantos endereços de endpoint existem, e de onde eles vêm?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get endpointslices -l kubernetes.io/service-name=web
NAME        ADDRESSTYPE   PORTS   ENDPOINTS                            AGE
web-abcde   IPv4          8080    10.244.0.7,10.244.0.8,10.244.0.9     30s
```

**Três** endereços — um por Pod. (Note que a coluna `PORTS` diz **8080**: a slice lista
portas de *container* — a `port: 80` do próprio Service existe apenas do lado do Service.)
O controller de endpoints observou o selector do Service,
encontrou os três Pods `app: web` e escreveu os IPs deles em uma **EndpointSlice**. Compare
os IPs com `kubectl get pods -o wide` — são os IPs dos Pods. O Service é apenas uma porta de
entrada estável; EndpointSlices são a lista viva de quem está atrás dela.
</details>

---

### Step 3 — alcance-o por DNS a partir de um Pod descartável

O DNS do cluster dá um nome a cada Service. A partir de um Pod temporário, busque a página
de status da aplicação de demo pelo nome do Service `web`:

```bash
kubectl run tmp --restart=Never --image=busybox:1.36 -- sleep 3600
kubectl wait --for=condition=Ready pod/tmp --timeout=60s
kubectl exec tmp -- wget -qO- http://web
```

**Tarefa:** o que você recebeu de volta, e qual nome foi resolvido? Execute algumas vezes —
observe a linha `pod:`.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl exec tmp -- wget -qO- http://web
workshop-web v1
pod: web-6f8c9d5b7c-7nqld
requests served: 1
ready: true
```

`http://web` resolveu via DNS do cluster para o ClusterIP do Service, que balanceou a carga
para um dos três Pods — a linha `pod:` nomeia qual deles respondeu, então execuções
repetidas mostram Pods diferentes se revezando. (Note que você buscou a porta **80**, a
porta do Service; o Service encaminhou para a **8080** do container.) O nome totalmente
qualificado é `web.<your-namespace>.svc.cluster.local`;
dentro do mesmo namespace o nome curto `web` basta. Manter o Pod `tmp` vivo torna
determinísticas as checagens posteriores de falha e recuperação; o cleanup do lab o deleta.
</details>

---

### Step 4 — quebre o selector (a falha silenciosa)

Mude o selector do Service para um label que **nenhum Pod tem**, depois tente de novo.
Observe com atenção: o objeto Service permanece perfeitamente saudável.

```bash
kubectl patch service web --type=merge -p '{"spec":{"selector":{"app":"web-oops"}}}'
kubectl get service web                                   # ainda está lá, ainda tem um ClusterIP
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl exec tmp -- wget -qO- --timeout=5 http://web ; echo "exit=$?"
```

**Tarefa:** o curl falha. Onde a falha fica visível — no Service, ou em outro lugar?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get service web
NAME   TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
web    ClusterIP   10.96.142.51    <none>        80/TCP    6m      # parece totalmente normal

$ kubectl get endpointslices -l kubernetes.io/service-name=web
NAME        ADDRESSTYPE   PORTS   ENDPOINTS   AGE
web-abcde   IPv4          8080    <unset>     6m                   # <-- ZERO endpoints

$ kubectl exec tmp -- wget -qO- --timeout=5 http://web ; echo "exit=$?"
wget: download timed out
exit=1
```

Esta é a armadilha clássica: **o Service está saudável, tem um ClusterIP e não reporta
erros** — mas sua EndpointSlice está **vazia** porque o selector não casa com nada, então o
tráfego não tem para onde ir. `kubectl describe service web` até mostra
`Endpoints: <none>`. A lição: quando um Service "não funciona", cheque primeiro os
**endpoints** dele, não o objeto Service.
</details>

### Step 5 — conserte e verifique de novo

```bash
kubectl patch service web --type=merge -p '{"spec":{"selector":{"app":"web"}}}'
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl exec tmp -- wget -qO- http://web | head -1
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get endpointslices -l kubernetes.io/service-name=web
NAME        ADDRESSTYPE   PORTS   ENDPOINTS                          AGE
web-abcde   IPv4          8080    10.244.0.7,10.244.0.8,10.244.0.9   8m

$ kubectl exec tmp -- wget -qO- http://web | head -1
workshop-web v1
```

Restaurar `app: web` repopula a EndpointSlice em cerca de um segundo e o tráfego volta a
fluir. O mesmo manifesto, um label — essa é toda a diferença entre funcionar e estar
silenciosamente morto.
</details>

## Expected state / output

- O Service ganha um `ClusterIP` estável; sua EndpointSlice lista **um endereço por Pod**.
- `http://web` resolve via DNS do cluster e retorna o corpo de status da aplicação de demo —
  a linha `pod:` alterna entre os três Pods.
- Um selector errado deixa o Service com **aparência saudável, mas com zero endpoints**, e
  as requisições estouram o timeout — de forma idêntica nos dois ambientes.
- Consertar o selector repopula os endpoints e restaura o tráfego imediatamente.

## Explanation

Um selector de Service produz a participação na EndpointSlice a partir dos labels e da
readiness dos Pods. O DNS resolve o nome estável do Service, enquanto EndpointSlices
rastreiam os endereços efêmeros dos Pods. Um Service válido com uma slice vazia tem,
portanto, aparência saudável, mas é incapaz de rotear — a causa real vive nos endpoints, não
no objeto Service.

## Troubleshooting and recovery

Se as requisições estourarem o timeout, inspecione primeiro a EndpointSlice. Restaure o
selector exato com `kubectl patch service web -n "$NS" --type=merge -p
'{"spec":{"selector":{"app":"web"}}}'`, depois aguarde os endpoints ficarem ready.

## Challenge solution

### Commands / manifest

```bash
# Terminal A:
kubectl get endpointslices -l kubernetes.io/service-name=web -w
# Terminal B:
POD=$(kubectl get pods -n "$NS" -l app=web --field-selector=status.phase=Running \
  -o jsonpath='{.items[0].metadata.name}')
OLD_IP=$(kubectl get pod "$POD" -n "$NS" -o jsonpath='{.status.podIP}')
kubectl delete pod "$POD" -n "$NS"
kubectl rollout status deployment/web -n "$NS" --timeout=180s
NEW_IPS=$(kubectl get endpointslices -n "$NS" -l kubernetes.io/service-name=web \
  -o jsonpath='{range .items[*].endpoints[*]}{.addresses[0]}{"\n"}{end}')
printf 'removed=%s\ncurrent=%s\n' "$OLD_IP" "$NEW_IPS"
! printf '%s\n' "$NEW_IPS" | grep -Fx "$OLD_IP"
```

### Expected state / output

O endereço registrado desaparece do watch da EndpointSlice, e um endereço substituto aparece
depois que o Deployment volta a Available. A asserção final só tem sucesso quando o IP
antigo não está mais selecionado.

### Explanation

EndpointSlices rastreiam os endereços de Pods selecionados e ready. Deletar exatamente um
Pod remove seu endereço — é essa a causa de o endereço sair da slice; o ReplicaSet então
cria um substituto que só entra depois de ficar Ready.

### Hints

Registre o nome e o IP do Pod escolhido antes da deleção; use o watch da EndpointSlice e
compare os endereços removido e substituto.
