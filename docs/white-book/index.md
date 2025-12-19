---
layout: doc
---

<script setup>
import { onMounted } from 'vue'
import { useRouter, withBase } from 'vitepress'

onMounted(() => {
  const router = useRouter()
  router.go(withBase('/white-book/01-overview/'))
})
</script>

# White Book

正在跳转到 [概述](./01-overview/)...
