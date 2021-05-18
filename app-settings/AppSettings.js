/**
 * This component is designed to be extended by another component. It does not
 * render any HTML on its own.
 * 
 * It provides methods for working with the settings forms, sycning options,
 * handing fields, and more.
 * 
 * It should be extended by `server-settings`, `music-settings`,
 * `photos-settings`, etc. It is up to those extenters to implement displaying
 * the form (in a modal or whatever).
 */
import __ from '../../double-u/index.js'
import i18n from '../../i18n.js/index.js'
import Lowrider from '../../lowrider.js/index.js'
import * as forms from '../../cardinal-forms/index.js'

// logic for individual fields
import * as langLogic from './field-logic/lang.js'

export class AppSettings extends Lowrider {
  constructor() {
    super()
    this.formId = '#app-settings-form'
    this.boundOnDataSettingsAttrClick = this.onDataSettingsAttrClick.bind(this)
    this.onFieldChange = null

    // cache of settings event callbacks
    this._callbacks = {
      'onClose': []
    }
  }

  /**
   * Call this to init all settings fields.
   */
  formSetup() {
    this.watchSyncGroups() // watches for generic changes to the settings form fields
    this.initForm() // inits field listeners for fields with logic imported from submodules
  }

  /**
   * Some fields are too simple to require their own module. Register their events here.
   */
  registerFieldEventListeners() {
    /**
     * When factory reset is clicked
     */
    let resetBtn = __(this).find(`${this.formId} button[name="factory-reset"]`)

    if (resetBtn.els.length) {
      resetBtn.each((btn) => {
        btn.addEventListener('click', (event) => {
          event.preventDefault()
    
          if (confirm(i18n('settings.factory-reset.confirm'))) {
            if (confirm(i18n('danger-confirm'))) {
              Bridge.ipcSay('factory-reset')
            }
          }
        })
      })
    }

    /**
     * When the color theme is switched.
     */
    __(this).find('select[name="color_theme"]').on('change', function() {
      let selectedTheme = __(this).value()
      __('#app').attr('color-theme', selectedTheme)
    })

    /**
     * When a color swatch is clicked.
     */
    __(this).find('.color-swatch').on('click', function() {
      let swatch = __(this)
      let color = swatch.attr('data-color')

      Bridge.ipcAsk('set-option', {
        'option': 'accent_color',
        'value': color
      })
      
      document.documentElement.style.setProperty('--accent-color', color)
    })
  }

  /**
   * Removes event handlers that are registered by submodules
   */
  removeEventHandlers() {
    langLogic.unsubscribe()
  }

  /**
   * Triggered whenever an element with the data-settings attribute is clicked.
   */
  onDataSettingsAttrClick(event) {
    let tabToShow = __(event.target).attr('data-settings')

    if (!event.target.matches('[data-settings]')) {
      tabToShow = __(event.target.closest('[data-settings]')).attr('data-settings')
    }

    this.openSettingsPanel(tabToShow)
  }

  /**
   * There are .field-group's in the settings <form> that have [data-sync-with-db="true"],
   * this function will watch them and sync their changes within the database options table.
   */
  watchSyncGroups() {
    // called when a field is changed
    this.onFieldChange = (event) => {
      let el = event.target
      let optionName = __(el).attr('name')
      let newVal
      
      if (__(el).attr('type') === 'checkbox') {
        newVal = el.checked
      } else {
        newVal = __(el).value()
      }

      Bridge.ipcAsk('set-option', {'option': optionName, 'value': newVal})
    }

    // handler will get attached directly to Elements
    __(`${this.formId} [data-sync-with-db="true"] select`).on('change', this.onFieldChange)
    __(`${this.formId} [data-sync-with-db="true"] input`).on('change', this.onFieldChange)
    __(`${this.formId} [data-sync-with-db="true"] textarea`).on('change', this.onFieldChange)
  }

  /**
   * Sets the values for the inputs within [data-sync-with-db="true"] upon modal load
   */
  setSyncGroups() {
    __(`${this.formId} [data-sync-with-db="true"]`)
    .find('select, input, textarea')
    .each(async (el) => {
      let optionName = __(el).attr('name')
      let optionValue = await Bridge.ipcAsk('get-option', optionName)

      if (el.matches('[type="checkbox"]')) {
        if (optionValue === 1) {
          el.checked = true
        } else if (optionValue === 0) {
          el.checked = false
        }
      } else {
        __(el).value(optionValue)
      }
    })
  }

  /**
   * Visually shows the settings panel to the user.
   * 
   * @param {string} tabToShow - The name of the tab to show on init. Defaults to the last open tab, or the first tab.
   */
  openSettingsPanel(tabToShow) {
    // if it's already open, do nothing
    if (__('.settings-panel').hasClass('open')) return

    __('#app').addClass('settings-open')
    __('.settings-panel').addClass('open')

    if (!tabToShow) {
      let lastUsedTab = __(this.tabs.selector).attr('data-current-tab')
      
      if (lastUsedTab) {
        tabToShow = lastUsedTab
      }
    }

    this.tabs.showTab(tabToShow)

    __().keepFocusWithin('.settings-panel')
  }

  /**
   * Right before the modal animates in, init all of the field groups.
   */
  initForm() {
    forms.prepare(this.querySelector(this.formId))
    this.setSyncGroups()
    langLogic.subscribe()
    this.registerFieldEventListeners()

    // block form submission which would reload the page
    __(this.formId).on('submit', (event) => {
      event.preventDefault()
    })
  }

  /**
   * Allows other custom elements to register a callback with the settings.
   * 
   * @param {string} event - The event type. Supports `onClose`.
   */
  registerCallback(event, cb) {
    this._callbacks[event].push(cb)
  }

  /**
   * See getFieldTemplate()
   * 
   * Returns an object of all strigified templates.
   */
  getFieldTemplates() {
    let templates = [
      'advanced/developer',
      'advanced/factory-reset',
      'general/lang',
      'general/notifications',
      'general/start-page',
      'general/updates',
      'modals/folder-structure',
      'playback/flags',
      'theme/color-theme',
      'theme/custom-css',
      'theme/swatches',
    ]
    let obj = {}

    for (let templateName of templates) {
      obj[`settings-field/${templateName}`] = this.getFieldTemplate(templateName)
    }

    return obj
  }

  /**
   * I really hate to embed HTML in JS like this, but because of this bug...
   *
   * https://github.com/electron-userland/electron-builder/issues/3185
   *
   * ...I cannot have HTML files in a renderer node_modules, because they won't
   * be copied into the asar archive. The only templates affected are the global
   * ones shared between all client apps in the `cardinal-shared-components`
   * package.
   *
   * The plan is to serve HTML templates with the API for mobile device support,
   * so until then, this will have to do.
   * 
   * FIXME
   */
  getFieldTemplate(field) {
    switch (field) {
      case 'advanced/developer':
        return /*html*/`
        <div class="form-group" data-sync-with-db="true">
          <h4 class="group-title">{i18n{settings.developer.title}}</h4>
        
          <input type="checkbox" name="developer_mode" data-label="{i18n{settings.developer.enable-label}}">
        </div>`
        break

      case 'advanced/factory-reset':
        return /*html*/`
        <div class="form-group factory-reset-group">
          <h4 class="group-title">{i18n{settings.factory-reset.title}}</h4>

          <button class="danger" type="button" name="factory-reset">
            <span tabindex="-1">{i18n{settings.factory-reset.desc}}</span>
          </button>
        </div>`
        break

      case 'general/lang':
        return /*html*/`
        <div class="form-group" data-sync-with-db="true">
          <h4 class="group-title">{i18n{settings.language.title}}</h4>

          <select name="lang">
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </div>`
        break

      case 'general/notifications':
        return /*html*/`
        <div class="form-group" data-sync-with-db="true">
          <h4 class="group-title">{i18n{settings.notifications.title}}</h4>

          <input type="checkbox" name="notification_on_song_change" data-label="{i18n{settings.notifications.song-change-label}}">
        </div>`
        break

      case 'general/start-page':
        return /*html*/`
        <div class="form-group" data-sync-with-db="true">
          <h4 class="group-title">{i18n{settings.start-page.title}}</h4>

          <select name="start_page">
            <optgroup label="{i18n{nav.music.title}}">
              <option value="/explore-music">{i18n{nav.music.explore}}</option>
              <option value="/artists">{i18n{nav.music.artists}}</option>
              <option value="/albums">{i18n{nav.music.albums}}</option>
              <option value="/tracks">{i18n{nav.music.tracks}}</option>
              <option value="/playlists">{i18n{nav.music.playlists}}</option>
              <option value="/music-genres">{i18n{nav.music.genres}}</option>
            </optgroup>
            <optgroup label="{i18n{nav.cinema.title}}">
              <option value="/home-cinema">{i18n{nav.cinema.home-cinema}}</option>
              <option value="/tv">{i18n{nav.cinema.tv}}</option>
              <option value="/movies">{i18n{nav.cinema.movies}}</option>
              <option value="/channels">{i18n{nav.cinema.channels}}</option>
              <option value="/cinema-genres">{i18n{nav.cinema.genres}}</option>
            </optgroup>
          </select>
        </div>`
        break

      case 'general/updates':
        return /*html*/`
        <div class="form-group" data-sync-with-db="true">
          <h4 class="group-title">{i18n{settings.updates.title}}</h4>

          <input type="checkbox" name="auto_check_for_updates" data-label="{i18n{settings.updates.auto-check-label}}">
        </div>`
        break

      case 'modals/folder-structure':
        return /*html*/`
        <div class="folder-structure-guide">
          <div class="modal-header">
            <h2>{i18n{folder-structure-guide.title}}</h2>
          </div>

          <div class="text-content">
            {i18n{folder-structure-guide.desc-before-examples}}
          </div>

          <div class="folder-structure-examples">
            <!-- Music Examples -->
            <h3>{i18n{folder-structure-guide.example.music.title}}</h3>

            <div class="code-blocks half-half">
              <code>
                /{i18n{folder-structure-guide.example.music.code.artist}}<br>
                &nbsp;&nbsp;/{i18n{folder-structure-guide.example.music.code.album}}<br>
                &nbsp;&nbsp;&nbsp;&nbsp;• {i18n{folder-structure-guide.example.music.code.song}}<br>
                &nbsp;&nbsp;&nbsp;&nbsp;• {i18n{folder-structure-guide.example.music.code.cover-art}}<br>
              </code>
              <div class="or">{i18n{or}}</div>
              <code>
                /{i18n{folder-structure-guide.example.music.code.artist}}<br>
                &nbsp;&nbsp;/{i18n{folder-structure-guide.example.music.code.album}}<br>
                &nbsp;&nbsp;&nbsp;&nbsp;/{i18n{folder-structure-guide.example.music.code.disc}}<br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;• {i18n{folder-structure-guide.example.music.code.song}}<br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;• {i18n{folder-structure-guide.example.music.code.cover-art}}<br>
              </code>
            </div>
          </div>

          <div class="supported-types">
            <h3>{i18n{folder-structure-guide.supported-types.title}}</h3>

            <table class="informational">
              <tr>
                <td>{i18n{folder-structure-guide.example.music.title}}</td>
                <td>
                  <code class="inline">.mp3</code>
                  <code class="inline">.flac</code>
                </td>
              </tr>
              <tr>
                <td>{i18n{folder-structure-guide.example.tv-movies.title}}</td>
                <td>
                  <code class="inline">.mp4</code>
                </td>
              </tr>
              <tr>
                <td>{i18n{folder-structure-guide.supported-types.artwork}}</td>
                <td>
                  <code class="inline">.jpg</code>
                  <code class="inline">.png</code>
                  <code class="inline">.gif</code>
                </td>
              </tr>
            </table>
          </div>
        </div>`
        break

      case 'playback/flags':
        return /*html*/`
        <div class="form-group" data-sync-with-db="true">
          <h4 class="group-title">{i18n{settings.music-playback.title}}</h4>

          <input type="checkbox" name="always_load_whole_song" data-label="{i18n{settings.music-playback.always-load-whole-song}}">
        </div>`
        break

      case 'theme/color-theme':
        return /*html*/`
        <div class="form-group" data-sync-with-db="true">
          <h4 class="group-title">{i18n{settings.color-theme.title}}</h4>

          <select name="color_theme">
            <option value="light">{i18n{settings.color-theme.option.light}}</option>
            <option value="dark">{i18n{settings.color-theme.option.dark}}</option>
          </select>
        </div>`
        break

      case 'theme/custom-css':
        return /*html*/`
        <div class="form-group" data-sync-with-db="true">
          <h4 class="group-title">{i18n{settings.custom-css.title}}</h4>

          <div class="instructions">
            <div class="slidetoggle slim">
              <button class="label">
                <span tabindex="-1">
                  <i class="warning-icon fas fa-exclamation-triangle"></i>
                  {i18n{settings.custom-css.notice}}
                </span>
              </button>

              <span class="content">{i18n{settings.custom-css.instructions}}</span>
            </div>
          </div>

          <textarea class="custom-css" name="custom_css"></textarea>
        </div>`
        break

      case 'theme/swatches':
        return /*html*/`
        <div class="form-group">
          <h4 class="group-title">{i18n{settings.accent-color.title}}</h4>

          <div class="swatches">
            <button title="The Worst Flavour" type="button" class="color-swatch clicks" data-color="#a174dd" style="background-color:#a174dd;"></button>
            <button title="Flamingo Jam Pink" type="button" class="color-swatch clicks" data-color="#e9219c" style="background-color:#e9219c;"></button>
            <button title="Rapper Name lil'Blue" type="button" class="color-swatch clicks" data-color="#4da3bd" style="background-color:#4da3bd;"></button>
            <button title="The Bold and the Bluetiful" type="button" class="color-swatch clicks" data-color="#3793cf" style="background-color:#3793cf;"></button>
            <button title="Cantaloupe Green" type="button" class="color-swatch clicks" data-color="#57b983" style="background-color:#57b983;"></button>
            <button title="Zergling Rush! Green" type="button" class="color-swatch clicks" data-color="#379c3f" style="background-color:#379c3f;"></button>
            <button title="Nuclear Warning Yellow" type="button" class="color-swatch clicks" data-color="#ccb118" style="background-color:#ccb118;"></button>
            <button title="At Least It's Not Brown, Orange" type="button" class="color-swatch clicks" data-color="#d45912" style="background-color:#d45912;"></button>
            <button title="Alien Invasion Red" type="button" class="color-swatch clicks" data-color="#cc4c43" style="background-color:#cc4c43;"></button>
            <button title="Soulless Grey" type="button" class="color-swatch clicks" data-color="#575757" style="background-color:#575757;"></button>
          </div>
        </div>`
        break
    }
  }
}