# Lab 06 — Deployment (S06) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 1 — estenda o Pod em um Deployment

Um Deployment carrega o **mesmo Pod** dentro de `spec.template`, mais três coisas novas:
`replicas`, um `selector` e metadata sobre o template. Compare com o seu `pod.yaml` —
tudo sob `template:` é o Pod do Lab 05, indentado.

```bash
cat > deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web          # deve casar com template.metadata.labels abaixo
  template:
    metadata:
      labels:
        app: web        # os labels do Pod — o Service do Lab 07 seleciona estes
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 250m
              memory: 128Mi
EOF

kubectl apply -f deployment.yaml
kubectl get deploy,rs,pods -l app=web
```

**Tarefa:** quantos Pods aparecem, e o que é dono deles?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get deploy,rs,pods -l app=web
NAME                  READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/web   3/3     3            3           10s

NAME                             DESIRED   CURRENT   READY   AGE
replicaset.apps/web-6f8c9d5b7c   3         3         3       10s

NAME                       READY   STATUS    RESTARTS   AGE
pod/web-6f8c9d5b7c-2xk9p   1/1     Running   0          10s
pod/web-6f8c9d5b7c-7nqld   1/1     Running   0          10s
pod/web-6f8c9d5b7c-lm4tt   1/1     Running   0          10s
```

A cadeia é **Deployment → ReplicaSet → 3 Pods**. O Deployment criou um ReplicaSet; o
ReplicaSet criou os Pods. Os nomes dos Pods são `<rs-name>-<random>`.
</details>

**Pergunta:** delete um Pod — o que acontece, e como isso é diferente do Lab 05?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl delete pod -l app=web --field-selector status.phase=Running | head -1
pod "web-6f8c9d5b7c-2xk9p" deleted
$ kubectl get pods -l app=web
NAME                       READY   STATUS    RESTARTS   AGE
web-6f8c9d5b7c-7nqld       1/1     Running   0          2m
web-6f8c9d5b7c-lm4tt       1/1     Running   0          2m
web-6f8c9d5b7c-rr8vd       1/1     Running   0          3s     # <-- substituto novo em folha
```

O ReplicaSet o **recria imediatamente** para manter `replicas: 3`. No Lab 05, o Pod avulso
permaneceu deletado. Essa reconciliação — observado vs desejado → agir — é o ponto central de
um controller.
</details>

---

### Step 2 — escale

```bash
kubectl scale deployment web --replicas=5
kubectl get pods -l app=web -w        # Ctrl-C quando os 5 estiverem Running
kubectl scale deployment web --replicas=3
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl scale deployment web --replicas=5
deployment.apps/web scaled
$ kubectl get pods -l app=web
NAME                       READY   STATUS    RESTARTS   AGE
web-6f8c9d5b7c-7nqld       1/1     Running   0          5m
web-6f8c9d5b7c-lm4tt       1/1     Running   0          5m
web-6f8c9d5b7c-rr8vd       1/1     Running   0          3m
web-6f8c9d5b7c-8p2mn       1/1     Running   0          6s
web-6f8c9d5b7c-c4wjx       1/1     Running   0          6s
```

Escalar muda apenas `replicas`; o ReplicaSet adiciona ou remove Pods para corresponder.
Reduzir de volta para 3 encerra dois deles.
</details>

---

### Step 3 — faça o rollout de uma nova image, observe os ReplicaSets se alternarem

Em um terminal, comece a observar os ReplicaSets; em outro, troque a image.

```bash
# Terminal A — deixe este rodando:
kubectl get rs -l app=web -w

# Terminal B:
kubectl set image deployment/web web=ghcr.io/platformrelay/workshop-web:v2
kubectl rollout status deployment/web
```

**Tarefa:** no Terminal A, descreva o que acontece com o número de ReplicaSets.

<details><summary>Solução / saída esperada</summary>

```console
# Terminal A (watch):
NAME             DESIRED   CURRENT   READY   AGE
web-6f8c9d5b7c   3         3         3       8m      # RS antigo (workshop-web:v1)
web-7d4bf9c8f5   1         1         0       0s      # RS novo (workshop-web:v2) escala para cima...
web-6f8c9d5b7c   2         3         3       8m      # ...o antigo escala para baixo em sincronia
web-7d4bf9c8f5   3         3         3       20s
web-6f8c9d5b7c   0         0         0       8m      # RS antigo esvaziado, mantido para rollback

# Terminal B:
$ kubectl rollout status deployment/web
deployment "web" successfully rolled out
```

Um **segundo ReplicaSet** aparece para a nova image. O RS novo escala para **cima** enquanto
o RS antigo escala para **baixo**, um passo de cada vez (governado por
`maxSurge`/`maxUnavailable`), então a aplicação permanece disponível o tempo todo. O RS
antigo é mantido com 0 réplicas para rollback.
</details>

---

### Step 4 — histórico e rollback

```bash
kubectl rollout history deployment/web
kubectl rollout undo deployment/web
kubectl rollout status deployment/web
```

**Tarefa:** verifique que a image realmente reverteu para
`ghcr.io/platformrelay/workshop-web:v1`.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get deployment web -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
ghcr.io/platformrelay/workshop-web:v1
```

`rollout undo` promoveu o ReplicaSet antigo de volta a 3 réplicas e escalou o novo para 0 —
o inverso do Step 3. O one-liner de jsonpath lê a image atual direto do Deployment.
</details>

---

### Step 5 — quebre/conserte: um rollout que trava

Faça o rollout de uma tag de image que não existe e observe o rollout **travar** em vez de
derrubar a aplicação em execução.

```bash
kubectl set image deployment/web web=ghcr.io/platformrelay/workshop-web:v9.99-nope
kubectl rollout status deployment/web --timeout=30s ; echo "exit=$?"
kubectl get pods -l app=web
```

**Tarefa:** a aplicação em execução nunca caiu — por quê, e como você se recupera?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl rollout status deployment/web --timeout=30s ; echo "exit=$?"
Waiting for deployment "web" rollout to finish: 1 out of 3 new replicas have been updated...
error: timed out waiting for the condition
exit=1

$ kubectl get pods -l app=web
NAME                       READY   STATUS             RESTARTS   AGE
web-6f8c9d5b7c-7nqld       1/1     Running            0          12m   # Pods antigos ainda servindo
web-6f8c9d5b7c-lm4tt       1/1     Running            0          12m
web-7c9955bbbf-abcde       0/1     ImagePullBackOff   0          40s   # o Pod novo não consegue fazer pull

$ kubectl rollout undo deployment/web        # recuperar
deployment.apps/web rolled back
```

O `maxUnavailable` mantém os Pods **antigos** rodando até os novos ficarem `Ready`. O Pod
novo ruim fica preso em `ImagePullBackOff`, então o rollout nunca completa — mas também
nunca derruba a aplicação. `rollout undo` reverte para o último ReplicaSet bom.
</details>

## Expected state / output

- `Deployment → ReplicaSet → Pods`; deletar um Pod dispara a recriação imediata.
- Uma nova image gera um **segundo ReplicaSet**; o novo escala para cima enquanto o antigo
  escala para baixo, sem indisponibilidade.
- `rollout undo` restaura a image anterior (verificado por jsonpath).
- Um rollout com image ruim **trava** com o Pod novo em `ImagePullBackOff` enquanto os Pods
  antigos continuam servindo — recuperado com `rollout undo`.

## Explanation

Um Deployment reconcilia ReplicaSets, e ReplicaSets reconciliam Pods. Os controles de
rolling update limitam as réplicas indisponíveis e as excedentes; o histórico aponta para
templates de Pod anteriores — é essa a causa de o undo conseguir restaurar o último template
sabidamente bom após um rollout de image travado.

## Troubleshooting and recovery

Se o rollout permanecer travado, execute
`kubectl rollout undo deployment/web -n "$NS"` e aguarde o rollout status. Faça o describe
do ReplicaSet mais novo e dos seus Pods antes de tentar de novo.

## Challenge solution

### Commands / manifest

```bash
kubectl patch deployment web --type=merge \
  -p '{"spec":{"strategy":{"rollingUpdate":{"maxSurge":2,"maxUnavailable":0}}}}'
# Mantenha este watch rodando no Terminal A e registre a contagem mínima de Ready e o pico total.
kubectl get pods -l app=web -w

# Terminal B:
kubectl set image deployment/web web=ghcr.io/platformrelay/workshop-web:v2
kubectl rollout status deployment/web --timeout=180s
kubectl get deployment web -o jsonpath='{.status.readyReplicas}{" ready; "}{.status.replicas}{" current\n"}'
```

### Expected state / output

O watch nunca cai abaixo de três Pods Ready e pode mostrar brevemente até cinco Pods no
total. O status final do Deployment retorna a `3 ready; 3 current`.

### Explanation

`maxUnavailable: 0` protege a disponibilidade, enquanto `maxSurge: 2` permite dois Pods
substitutos acima da contagem desejada de réplicas — causando um excedente temporário de
capacidade em troca de um rollout mais seguro.

### Hints

Mantenha `kubectl get pods -w` em um terminal e use os comandos de patch/image em outro;
conte os Pods `Running` mais `ContainerCreating` no pico.
