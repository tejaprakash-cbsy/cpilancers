'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ClientJobService as JobService } from '@/services/client-api.service';
import { JobCard, type JobCardJob } from '@/components/jobs/job-card';
import type { Job } from '@/types/database';

interface JobFilters {
  search: string;
  sapProducts: string[];
  sourceSystems: string[];
  targetSystems: string[];
  integrationTypes: string[];
  protocols: string[];
  budgetMin: string;
  budgetMax: string;
  experienceMin: string;
  projectType: string;
  status: string[];
  sortBy: string;
  sortOrder: string;
  page: number;
  limit: number;
}

export default function JobsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<JobFilters>({
    search: '',
    sapProducts: [],
    sourceSystems: [],
    targetSystems: [],
    integrationTypes: [],
    protocols: [],
    budgetMin: '',
    budgetMax: '',
    experienceMin: '',
    projectType: '',
    status: [],
    sortBy: 'created_at',
    sortOrder: 'desc',
    page: 1,
    limit: 10
  });
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  // Load jobs on initial load and when filters change
  useEffect(() => {
    loadJobs();
  }, [filters]);

  // Parse search params from URL on initial load
  useEffect(() => {
    const params = Object.fromEntries(searchParams);
    // Convert string values to appropriate types
    const parsedFilters = {
      search: params.search || '',
      sapProducts: params.sapProducts ? params.sapProducts.split(',') : [],
      sourceSystems: params.sourceSystems ? params.sourceSystems.split(',') : [],
      targetSystems: params.targetSystems ? params.targetSystems.split(',') : [],
      integrationTypes: params.integrationTypes ? params.integrationTypes.split(',') : [],
      protocols: params.protocols ? params.protocols.split(',') : [],
      budgetMin: params.budgetMin || '',
      budgetMax: params.budgetMax || '',
      experienceMin: params.experienceMin || '',
      projectType: params.projectType || '', // Add project type
      status: params.status ? params.status.split(',') : [],
      sortBy: params.sortBy || 'created_at',
      sortOrder: params.sortOrder || 'desc',
      page: parseInt(params.page) || 1,
      limit: parseInt(params.limit) || 10
    };
    setFilters(parsedFilters);
  }, [searchParams]);

  async function loadJobs() {
    try {
      setLoading(true);
      setError(null);
      
      // Convert empty strings to undefined for numeric filters
      const budgetMin = filters.budgetMin === '' ? undefined : parseInt(filters.budgetMin);
      const budgetMax = filters.budgetMax === '' ? undefined : parseInt(filters.budgetMax);
      const experienceMin = filters.experienceMin === '' ? undefined : parseInt(filters.experienceMin);
      
      // Prepare options for service
      const options = {
        page: filters.page,
        limit: filters.limit,
        search: filters.search || undefined,
        sapProducts: filters.sapProducts.length > 0 ? filters.sapProducts : undefined,
        sourceSystems: filters.sourceSystems.length > 0 ? filters.sourceSystems : undefined,
        targetSystems: filters.targetSystems.length > 0 ? filters.targetSystems : undefined,
        integrationTypes: filters.integrationTypes.length > 0 ? filters.integrationTypes : undefined,
        protocols: filters.protocols.length > 0 ? filters.protocols : undefined,
        budgetMin,
        budgetMax,
        experienceMin: experienceMin,
        projectType: filters.projectType || undefined,
        status: filters.status.length > 0 ? filters.status : undefined,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      };
      
      const result = await JobService.getJobs(options);
      setJobs(result.jobs);
      setPagination({
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit)
      });
    } catch (err: unknown) {
      console.error('Error loading jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  // Handle filter changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type, checked } = target;
    
    let newValue: string | boolean | string[] | number = value;
    if (type === 'checkbox') {
      newValue = checked;
    } else if (name === 'sapProducts' || name === 'sourceSystems' || name === 'targetSystems' || 
               name === 'integrationTypes' || name === 'protocols' || name === 'status') {
      // Handle multi-select (we'll implement a proper multi-select later)
      // For now, we'll treat as single value converted to array
      newValue = value ? [value] : [];
    } else if (name === 'page') {
      newValue = parseInt(value) || 1;
    } else if (name === 'limit') {
      newValue = parseInt(value) || 10;
    }
    
    setFilters((prev: JobFilters) => ({ ...prev, [name]: newValue }));
    // Reset to first page when filters change (except page itself)
    if (name !== 'page') {
      setFilters((prev: JobFilters) => ({ ...prev, page: 1 }));
    }
  };

  // Handle page change
  const handlePageChange = (newPage: number) => {
    setFilters((prev: JobFilters) => ({ ...prev, page: newPage }));
  };

  if (loading) {
    return (
      <>
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <p className="ml-4 text-lg">Loading jobs...</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <main className="min-h-[calc(100vh-14rem)] py-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-6">
              <p>{error}</p>
              <button 
                onClick={() => router.refresh()}
                className="mt-2 inline-block text-blue-600 hover:text-blue-800 font-medium"
              >
                Try again
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      {/* Filters */}
      <div className="mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filter Jobs</h2>
          <form className="space-y-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                name="search"
                value={filters.search}
                onChange={handleFilterChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Search by title or description..."
              />
            </div>
            
            {/* SAP Products */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SAP Products
              </label>
              <select
                multiple
                name="sapProducts"
                value={filters.sapProducts}
                onChange={handleFilterChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                size={4}
              >
                <option value="SAP_Cloud_Integration">SAP Cloud Integration</option>
                <option value="SAP_Integration_Suite">SAP Integration Suite</option>
                <option value="SAP_S4HANA">SAP S/4HANA</option>
                <option value="SAP_ECC">SAP ECC</option>
                <option value="SAP_SuccessFactors">SAP SuccessFactors</option>
                <option value="SAP_Ariba">SAP Ariba</option>
                <option value="API_Management">API Management</option>
                <option value="Event_Mesh">Event Mesh</option>
                <option value="REST">REST</option>
                <option value="SOAP">SOAP</option>
                <option value="OData">OData</option>
                <option value="IDoc">IDoc</option>
                <option value="SFTP">SFTP</option>
                <option value="JDBC">JDBC</option>
                <option value="OAuth">OAuth</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Hold Ctrl (Cmd on Mac) to select multiple
              </p>
            </div>
            
            {/* Source Systems */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Source Systems
              </label>
              <input
                type="text"
                name="sourceSystems"
                value={filters.sourceSystems.join(', ')}
                onChange={(e) => {
                  const values = e.target.value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                  setFilters((prev: JobFilters) => ({ ...prev, sourceSystems: values }));
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., SAP ERP, SAP S/4HANA, Legacy System"
              />
              <p className="mt-1 text-xs text-gray-500">
                Systems that will provide data for the integration
              </p>
            </div>
            
            {/* Target Systems */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Systems
              </label>
              <input
                type="text"
                name="targetSystems"
                value={filters.targetSystems.join(', ')}
                onChange={(e) => {
                  const values = e.target.value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                  setFilters((prev: JobFilters) => ({ ...prev, targetSystems: values }));
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., External CRM, Cloud Storage, ERP System"
              />
              <p className="mt-1 text-xs text-gray-500">
                Systems that will receive the integrated data
              </p>
            </div>
            
            {/* Integration Types */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Integration Types
              </label>
              <select
                multiple
                name="integrationTypes"
                value={filters.integrationTypes.length > 0 ? filters.integrationTypes[0] : ''}
                onChange={(e) => {
                  const values = e.target.value ? [e.target.value] : [];
                  setFilters((prev: JobFilters) => ({ ...prev, integrationTypes: values }));
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                size={3}
              >
                <option value="p2p">Peer-to-Peer (P2P)</option>
                <option value="a2a">Application-to-Application (A2A)</option>
                <option value="b2b">Business-to-Business (B2B)</option>
                <option value="batch">Batch Integration</option>
                <option value="realtime">Real-time Integration</option>
                <option value="event_driven">Event-Driven Integration</option>
                <option value="hybrid">Hybrid Integration</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Hold Ctrl (Cmd on Mac) to select multiple
              </p>
            </div>
            
            {/* Protocols */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Required Protocols
              </label>
              <select
                multiple
                name="protocols"
                value={filters.protocols.length > 0 ? filters.protocols[0] : ''}
                onChange={(e) => {
                  const values = e.target.value ? [e.target.value] : [];
                  setFilters((prev: JobFilters) => ({ ...prev, protocols: values }));
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                size={3}
              >
                <option value="REST">REST</option>
                <option value="SOAP">SOAP</option>
                <option value="OData">OData</option>
                <option value="IDoc">IDoc</option>
                <option value="SFTP">SFTP</option>
                <option value="JDBC">JDBC</option>
                <option value="OAuth">OAuth</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Hold Ctrl (Cmd on Mac) to select multiple
              </p>
            </div>
            
            {/* Budget Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min Budget ($)
                </label>
                <input
                  type="number"
                  name="budgetMin"
                  value={filters.budgetMin}
                  onChange={handleFilterChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 1000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Budget ($)
                </label>
                <input
                  type="number"
                  name="budgetMax"
                  value={filters.budgetMax}
                  onChange={handleFilterChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 10000"
                />
              </div>
            </div>
            
            {/* Experience */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Min Years Experience
              </label>
                <input
                  type="number"
                  name="experienceMin"
                  value={filters.experienceMin}
                  onChange={handleFilterChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 3"
                />
              </div>
              
              {/* Project Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project Type
                </label>
                <input
                  type="text"
                  name="projectType"
                  value={filters.projectType}
                  onChange={handleFilterChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Migration, Implementation"
                />
              </div>
            
            {/* Sort Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sort By
                </label>
                <select
                  name="sortBy"
                  value={filters.sortBy}
                  onChange={handleFilterChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="created_at">Newest First</option>
                  <option value="updated_at">Recently Updated</option>
                  <option value="views_count">Most Viewed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sort Order
                </label>
                <select
                  name="sortOrder"
                  value={filters.sortOrder}
                  onChange={handleFilterChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
            </div>
            
            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  // In a real implementation, we'd submit the form and update URL
                  // For now, we'll just trigger a reload with current filters
                  loadJobs();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
              >
                Apply Filters
              </button>
              <button
                type="button"
                onClick={() => {
                  // Reset filters
                  setFilters({
                    search: '',
                    sapProducts: [],
                    sourceSystems: [],
                    targetSystems: [],
                    integrationTypes: [],
                    protocols: [],
                    budgetMin: '',
                    budgetMax: '',
                    experienceMin: '',
                    projectType: '',
                    status: [],
                    sortBy: 'created_at',
                    sortOrder: 'desc',
                    page: 1,
                    limit: 10
                  });
                }}
                className="ml-3 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-sm font-medium rounded-lg"
              >
                Reset
              </button>
            </div>
          </form>
        </div>
      </div>
      
      {/* Jobs List */}
      <div className="mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-start p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              SAP Integration Jobs ({pagination.total} found)
            </h2>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">
                Jobs per page:
              </label>
              <select
                name="limit"
                value={filters.limit}
                onChange={handleFilterChange}
                className="ml-2 px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>
          
          {jobs.length > 0 ? (
            <div className="p-4">
              <div className="space-y-4">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job as unknown as JobCardJob} showActions={false} />
                ))}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-gray-500">
                No jobs found matching your criteria.
              </p>
              <button
                onClick={() => {
                  // Reset filters to see all jobs
                  setFilters({
                    search: '',
                    sapProducts: [],
                    sourceSystems: [],
                    targetSystems: [],
                    integrationTypes: [],
                    protocols: [],
                    budgetMin: '',
                    budgetMax: '',
                    experienceMin: '',
                    projectType: '',
                    status: [],
                    sortBy: 'created_at',
                    sortOrder: 'desc',
                    page: 1,
                    limit: 10
                  });
                }}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
              >
                Show All Jobs
              </button>
            </div>
          )}
          
          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="p-4 pt-0 border-t border-gray-200 flex justify-between items-center">
              <p className="text-sm text-gray-500">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    if (pagination.page > 1) {
                      handlePageChange(pagination.page - 1);
                    }
                  }}
                  disabled={pagination.page === 1}
                  className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-sm font-medium rounded-lg"
                >
                  Previous
                </button>
                <button
                  onClick={() => {
                    if (pagination.page < pagination.totalPages) {
                      handlePageChange(pagination.page + 1);
                    }
                  }}
                  disabled={pagination.page === pagination.totalPages}
                  className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-sm font-medium rounded-lg"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
