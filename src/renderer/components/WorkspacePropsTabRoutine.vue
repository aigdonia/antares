<template>
   <div class="workspace-query-tab column col-12 columns col-gapless">
      <div class="workspace-query-runner column col-12">
         <div class="workspace-query-runner-footer">
            <div class="workspace-query-buttons">
               <button
                  class="btn btn-primary btn-sm"
                  :disabled="!isChanged"
                  :class="{'loading':isSaving}"
                  @click="saveChanges"
               >
                  <span>{{ $t('word.save') }}</span>
                  <i class="mdi mdi-24px mdi-content-save ml-1" />
               </button>
               <button
                  :disabled="!isChanged"
                  class="btn btn-link btn-sm mr-0"
                  :title="$t('message.clearChanges')"
                  @click="clearChanges"
               >
                  <span>{{ $t('word.clear') }}</span>
                  <i class="mdi mdi-24px mdi-delete-sweep ml-1" />
               </button>

               <div class="divider-vert py-3" />

               <button
                  class="btn btn-dark btn-sm disabled"
                  :disabled="isChanged"
                  @click="false"
               >
                  <span>{{ $t('word.run') }}</span>
                  <i class="mdi mdi-24px mdi-play ml-1" />
               </button>
               <button class="btn btn-dark btn-sm" @click="showParamsModal">
                  <span>{{ $t('word.parameters') }}</span>
                  <i class="mdi mdi-24px mdi-dots-horizontal ml-1" />
               </button>
               <button class="btn btn-dark btn-sm" @click="showOptionsModal">
                  <span>{{ $t('word.options') }}</span>
                  <i class="mdi mdi-24px mdi-cogs ml-1" />
               </button>
            </div>
         </div>
      </div>
      <div class="workspace-query-results column col-12 mt-2 p-relative">
         <BaseLoader v-if="isLoading" />
         <label class="form-label ml-2">{{ $t('message.routineBody') }}</label>
         <QueryEditor
            v-if="isSelected"
            ref="queryEditor"
            :value.sync="localRoutine.sql"
            :workspace="workspace"
            :schema="schema"
            :height="editorHeight"
         />
      </div>
      <WorkspacePropsRoutineOptionsModal
         v-if="isOptionsModal"
         :local-options="localRoutine"
         :workspace="workspace"
         @hide="hideOptionsModal"
         @options-update="optionsUpdate"
      />
      <WorkspacePropsRoutineParamsModal
         v-if="isParamsModal"
         :local-parameters="localRoutine.parameters"
         :workspace="workspace"
         :routine="localRoutine.name"
         @hide="hideParamsModal"
         @parameters-update="parametersUpdate"
      />
   </div>
</template>

<script>
import { mapGetters, mapActions } from 'vuex';
import QueryEditor from '@/components/QueryEditor';
import BaseLoader from '@/components/BaseLoader';
import WorkspacePropsRoutineOptionsModal from '@/components/WorkspacePropsRoutineOptionsModal';
import WorkspacePropsRoutineParamsModal from '@/components/WorkspacePropsRoutineParamsModal';
import Routines from '@/ipc-api/Routines';

export default {
   name: 'WorkspacePropsTabRoutine',
   components: {
      QueryEditor,
      BaseLoader,
      WorkspacePropsRoutineOptionsModal,
      WorkspacePropsRoutineParamsModal
   },
   props: {
      connection: Object,
      routine: String
   },
   data () {
      return {
         tabUid: 'prop',
         isLoading: false,
         isSaving: false,
         isOptionsModal: false,
         isParamsModal: false,
         originalRoutine: null,
         localRoutine: { sql: '' },
         lastRoutine: null,
         sqlProxy: '',
         editorHeight: 300
      };
   },
   computed: {
      ...mapGetters({
         getWorkspace: 'workspaces/getWorkspace'
      }),
      workspace () {
         return this.getWorkspace(this.connection.uid);
      },
      isSelected () {
         return this.workspace.selected_tab === 'prop';
      },
      schema () {
         return this.workspace.breadcrumbs.schema;
      },
      isChanged () {
         return JSON.stringify(this.originalRoutine) !== JSON.stringify(this.localRoutine);
      },
      isDefinerInUsers () {
         return this.originalRoutine ? this.workspace.users.some(user => this.originalRoutine.definer === `\`${user.name}\`@\`${user.host}\``) : true;
      },
      schemaTables () {
         const schemaTables = this.workspace.structure
            .filter(schema => schema.name === this.schema)
            .map(schema => schema.tables);

         return schemaTables.length ? schemaTables[0].filter(table => table.type === 'table') : [];
      }
   },
   watch: {
      async routine () {
         if (this.isSelected) {
            await this.getRoutineData();
            this.$refs.queryEditor.editor.session.setValue(this.localRoutine.sql);
            this.lastRoutine = this.routine;
         }
      },
      async isSelected (val) {
         if (val && this.lastRoutine !== this.routine) {
            await this.getRoutineData();
            this.$refs.queryEditor.editor.session.setValue(this.localRoutine.sql);
            this.lastRoutine = this.routine;
         }
      },
      isChanged (val) {
         if (this.isSelected && this.lastRoutine === this.routine && this.routine !== null)
            this.setUnsavedChanges(val);
      }
   },
   mounted () {
      window.addEventListener('resize', this.resizeQueryEditor);
   },
   destroyed () {
      window.removeEventListener('resize', this.resizeQueryEditor);
   },
   methods: {
      ...mapActions({
         addNotification: 'notifications/addNotification',
         refreshStructure: 'workspaces/refreshStructure',
         setUnsavedChanges: 'workspaces/setUnsavedChanges',
         changeBreadcrumbs: 'workspaces/changeBreadcrumbs'
      }),
      async getRoutineData () {
         if (!this.routine) return;
         this.localRoutine = { sql: '' };
         this.isLoading = true;

         const params = {
            uid: this.connection.uid,
            schema: this.schema,
            routine: this.workspace.breadcrumbs.procedure
         };

         try {
            const { status, response } = await Routines.getRoutineInformations(params);
            if (status === 'success') {
               this.originalRoutine = response;
               this.localRoutine = JSON.parse(JSON.stringify(this.originalRoutine));
               this.sqlProxy = this.localRoutine.sql;
            }
            else
               this.addNotification({ status: 'error', message: response });
         }
         catch (err) {
            this.addNotification({ status: 'error', message: err.stack });
         }

         this.resizeQueryEditor();
         this.isLoading = false;
      },
      async saveChanges () {
         if (this.isSaving) return;
         this.isSaving = true;
         const params = {
            uid: this.connection.uid,
            schema: this.schema,
            routine: {
               ...this.localRoutine,
               oldName: this.originalRoutine.name
            }
         };

         try {
            const { status, response } = await Routines.alterRoutine(params);

            if (status === 'success') {
               const oldName = this.originalRoutine.name;

               await this.refreshStructure(this.connection.uid);

               if (oldName !== this.localRoutine.name) {
                  this.setUnsavedChanges(false);
                  this.changeBreadcrumbs({ schema: this.schema, procedure: this.localRoutine.name });
               }

               this.getRoutineData();
            }
            else
               this.addNotification({ status: 'error', message: response });
         }
         catch (err) {
            this.addNotification({ status: 'error', message: err.stack });
         }

         this.isSaving = false;
      },
      clearChanges () {
         this.localRoutine = JSON.parse(JSON.stringify(this.originalRoutine));
         this.$refs.queryEditor.editor.session.setValue(this.localRoutine.sql);
      },
      resizeQueryEditor () {
         if (this.$refs.queryEditor) {
            const footer = document.getElementById('footer');
            const size = window.innerHeight - this.$refs.queryEditor.$el.getBoundingClientRect().top - footer.offsetHeight;
            this.editorHeight = size;
            this.$refs.queryEditor.editor.resize();
         }
      },
      optionsUpdate (options) {
         this.localRoutine = options;
      },
      parametersUpdate (parameters) {
         this.localRoutine = { ...this.localRoutine, parameters };
      },
      showOptionsModal () {
         this.isOptionsModal = true;
      },
      hideOptionsModal () {
         this.isOptionsModal = false;
      },
      showParamsModal () {
         this.isParamsModal = true;
      },
      hideParamsModal () {
         this.isParamsModal = false;
      }
   }
};
</script>
