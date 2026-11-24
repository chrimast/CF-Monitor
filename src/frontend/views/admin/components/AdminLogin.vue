<template>
  <div id="login-overlay" class="login-overlay admin-login-screen">
    <div class="login-container admin-login-card">
      <div class="login-header admin-login-header">
        <div class="login-icon brand-mark admin-login-mark" aria-hidden="true">CF</div>
        <h2 class="login-title">CF-Monitor</h2>
        <p class="login-subtitle">{{ trans.enterCredentials }}</p>
      </div>
      <form class="admin-login-form" @submit.prevent="$emit('login')">
        <div v-if="isMultipleMode" class="login-form-group">
          <label class="login-label">{{ trans.apiEndpoint }}</label>
          <select :value="selectedApiIndex" class="login-input" @change="$emit('api-index-change', Number($event.target.value))">
            <option
              v-for="(base, index) in apiBases"
              :key="index"
              :value="index"
            >
              [{{ index }}] {{ base }}
            </option>
          </select>
        </div>
        <div class="login-form-group">
          <label class="login-label">{{ trans.username }}</label>
          <input type="text" name="username" autocomplete="username" v-model="loginForm.username" required class="login-input" :placeholder="trans.usernamePlaceholder">
        </div>
        <div class="login-form-group last">
          <label class="login-label">{{ trans.password }}</label>
          <div class="password-input-wrapper">
            <input :type="passwordVisible.login ? 'text' : 'password'" name="password" autocomplete="current-password" v-model="loginForm.password" required class="login-input">
            <button type="button" class="password-toggle" :aria-label="passwordVisible.login ? trans.hidePassword : trans.showPassword" :aria-pressed="passwordVisible.login" @click="$emit('toggle-password', 'login')">
              {{ passwordVisible.login ? trans.hidePassword : trans.showPassword }}
            </button>
          </div>
        </div>
        <div v-if="turnstileSiteKey && (turnstileLoginEnabled || (turnstileEnabled && !turnstileVerified))" class="login-form-group">
          <div id="admin-turnstile-container"></div>
        </div>
        <div v-if="loginError" id="login-error" class="login-error" role="alert" aria-live="polite">{{ loginError }}</div>
        <button type="submit" class="login-btn" :disabled="loginLoading" :aria-busy="loginLoading">
          <span v-if="loginLoading" class="admin-login-spinner" aria-hidden="true"></span>
          {{ loginLoading ? trans.loginLoading : trans.login }}
        </button>
      </form>
    </div>
    <Footer />
  </div>
</template>

<script setup>
import Footer from '../../../components/Footer.vue'

defineProps({
  trans: { type: Object, required: true },
  isMultipleMode: { type: Boolean, default: false },
  apiBases: { type: Array, default: () => [] },
  selectedApiIndex: { type: Number, default: 0 },
  loginForm: { type: Object, required: true },
  passwordVisible: { type: Object, required: true },
  loginError: { type: String, default: '' },
  loginLoading: { type: Boolean, default: false },
  turnstileSiteKey: { type: String, default: '' },
  turnstileLoginEnabled: { type: Boolean, default: false },
  turnstileEnabled: { type: Boolean, default: false },
  turnstileVerified: { type: Boolean, default: false }
})

defineEmits(['login', 'toggle-password', 'api-index-change'])
</script>
